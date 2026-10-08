package com.rhn.pharmacy.application;

import com.rhn.pharmacy.api.MedicationFulfillmentDirectory;
import com.rhn.pharmacy.api.WardDeliveryDirectory;
import com.rhn.pharmacy.domain.DispenseTask;
import com.rhn.pharmacy.domain.InpatientMedicationSupplyLineStatus;
import com.rhn.pharmacy.domain.InpatientMedicationSupplyTaskStatus;
import com.rhn.pharmacy.domain.MedicationDispense;
import com.rhn.pharmacy.domain.MedicationDispenseConsumption;
import com.rhn.pharmacy.domain.MedicationDispenseLine;
import com.rhn.pharmacy.domain.DispenseTaskLine;
import com.rhn.pharmacy.domain.DispenseTaskLineStatus;
import com.rhn.pharmacy.infrastructure.DispenseTaskLineRepository;
import com.rhn.pharmacy.infrastructure.DispenseTaskRepository;
import com.rhn.pharmacy.infrastructure.MedicationDispenseConsumptionRepository;
import com.rhn.pharmacy.infrastructure.MedicationDispenseLineRepository;
import com.rhn.pharmacy.infrastructure.MedicationDispenseRepository;
import com.rhn.pharmacy.infrastructure.StockItemRepository;
import com.rhn.pharmacy.infrastructure.WardMedicationReturnLineRepository;
import com.rhn.pharmacy.infrastructure.InpatientMedicationSupplyLineRepository;
import com.rhn.pharmacy.infrastructure.InpatientMedicationSupplyTaskRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;

@Service
public class JpaMedicationFulfillmentDirectory implements MedicationFulfillmentDirectory {
    private final DispenseTaskLineRepository lines;
    private final DispenseTaskRepository tasks;
    private final MedicationDispenseRepository dispenses;
    private final MedicationDispenseLineRepository dispenseLines;
    private final MedicationDispenseConsumptionRepository consumptions;
    private final StockItemRepository stockItems;
    private final WardDeliveryDirectory wardDeliveries;
    private final WardMedicationReturnLineRepository wardReturns;
    private final InpatientMedicationSupplyLineRepository supplyLines;
    private final InpatientMedicationSupplyTaskRepository supplyTasks;

    public JpaMedicationFulfillmentDirectory(DispenseTaskLineRepository lines,
                                             DispenseTaskRepository tasks,
                                             MedicationDispenseRepository dispenses,
                                             MedicationDispenseLineRepository dispenseLines,
                                             MedicationDispenseConsumptionRepository consumptions,
                                             StockItemRepository stockItems,
                                             WardDeliveryDirectory wardDeliveries,
                                             WardMedicationReturnLineRepository wardReturns,
                                             InpatientMedicationSupplyLineRepository supplyLines,
                                             InpatientMedicationSupplyTaskRepository supplyTasks) {
        this.lines = lines;
        this.tasks = tasks;
        this.dispenses = dispenses;
        this.dispenseLines = dispenseLines;
        this.consumptions = consumptions;
        this.stockItems = stockItems;
        this.wardDeliveries = wardDeliveries;
        this.wardReturns = wardReturns;
        this.supplyLines = supplyLines;
        this.supplyTasks = supplyTasks;
    }

    @Override
    @Transactional(readOnly = true)
    public FulfillmentSnapshot fulfillmentForRequest(Long tenantId, Long medicationRequestId) {
        List<DispenseTaskLine> requestLines = lines.findByTenantIdAndRequestIdOrderById(
                tenantId, medicationRequestId);
        if (requestLines.isEmpty()) return FulfillmentSnapshot.pending();
        BigDecimal net = requestLines.stream().map(DispenseTaskLine::netDispensedQuantity)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        List<FulfillmentSnapshot> snapshots = requestLines.stream()
                .map(line -> snapshotForLine(tenantId, line)).toList();
        boolean completed = snapshots.stream().allMatch(FulfillmentSnapshot::completed);
        Long dispenseId = snapshots.stream().map(FulfillmentSnapshot::dispenseId)
                .filter(java.util.Objects::nonNull).reduce((first, second) -> second).orElse(null);
        String status = snapshots.stream().map(FulfillmentSnapshot::status).distinct().count() == 1
                ? snapshots.getFirst().status() : net.signum() > 0 ? "PARTIAL" : "INCOMPLETE";
        return new FulfillmentSnapshot(completed, dispenseId, net, status);
    }

    @Override
    @Transactional(readOnly = true)
    public FulfillmentSnapshot fulfillmentForConsumer(Long tenantId, Long medicationRequestId,
                                                      String consumerType, Long consumerId) {
        DispenseTaskLine line = taskLineForConsumer(tenantId, medicationRequestId, consumerType, consumerId, false);
        return line == null ? FulfillmentSnapshot.pending() : snapshotForLine(tenantId, line);
    }

    private FulfillmentSnapshot snapshotForLine(Long tenantId, DispenseTaskLine line) {
        Long latestDispenseId = dispenseLines.findIssuedLines(tenantId, line.id()).stream()
                .filter(value -> value.quantityDispensed().signum() > 0)
                .reduce((first, second) -> second).map(MedicationDispenseLine::medicationDispenseId).orElse(null);
        boolean completed = line.status() == DispenseTaskLineStatus.COMPLETED
                && line.netDispensedQuantity().signum() > 0 && latestDispenseId != null;
        return new FulfillmentSnapshot(completed, latestDispenseId, line.netDispensedQuantity(), line.status().name());
    }

    @Override
    @Transactional
    public ConsumptionSnapshot consume(ConsumptionCommand input) {
        ConsumptionInput values = parseConsumptionInput(input);
        ConsumptionSnapshot replay = replay(values.tenantId(), values.requestId(), values.consumerType(),
                values.consumerId(), values.commandCode(), values.baseUnit());
        if (replay != null) return replay;
        DispenseTaskLine taskLine = taskLineForConsumer(values.tenantId(), values.requestId(), values.consumerType(),
                values.consumerId(), true);
        DispenseTask task = tasks.lockByIdAndTenantId(taskLine.taskId(), values.tenantId())
                .orElseThrow(() -> conflict("MEDICATION_DISPENSE_TASK_MISSING", "药房发药任务不存在"));
        replay = replay(values.tenantId(), values.requestId(), values.consumerType(),
                values.consumerId(), values.commandCode(), values.baseUnit());
        if (replay != null) return replay;

        AvailableIssues issues = collectAvailableIssues(values, taskLine, task);
        requireSufficientAvailable(values, task, issues);
        return persistConsumptions(values, issues.available());
    }

    private ConsumptionInput parseConsumptionInput(ConsumptionCommand input) {
        Long tenantId = required(input.tenantId(), "MEDICATION_CONSUMPTION_TENANT_REQUIRED", "租户不能为空");
        Long requestId = required(input.medicationRequestId(), "MEDICATION_CONSUMPTION_REQUEST_REQUIRED",
                "药品请求不能为空");
        Long consumerId = required(input.consumerId(), "MEDICATION_CONSUMPTION_CONSUMER_REQUIRED",
                "用药执行事实不能为空");
        Long actorId = required(input.actorId(), "MEDICATION_CONSUMPTION_ACTOR_REQUIRED", "核销操作人不能为空");
        String consumerType = requiredText(input.consumerType(), "MEDICATION_CONSUMPTION_TYPE_REQUIRED",
                "核销来源类型不能为空").toUpperCase(Locale.ROOT);
        String commandCode = requiredText(input.commandCode(), "MEDICATION_CONSUMPTION_COMMAND_REQUIRED",
                "核销业务请求号不能为空");
        String baseUnit = requiredText(input.baseUnitCode(), "MEDICATION_CONSUMPTION_UNIT_REQUIRED",
                "核销基础单位不能为空");
        BigDecimal requiredBase = positive(input.requiredBaseQuantity(),
                "MEDICATION_CONSUMPTION_QUANTITY_INVALID", "核销基础数量必须大于零");
        return new ConsumptionInput(tenantId, requestId, consumerId, actorId, consumerType, commandCode, baseUnit,
                requiredBase);
    }

    private AvailableIssues collectAvailableIssues(ConsumptionInput values, DispenseTaskLine taskLine,
                                                    DispenseTask task) {
        Map<Long, List<MedicationDispenseLine>> issuedByDispense = new LinkedHashMap<>();
        for (MedicationDispenseLine line : dispenseLines.findIssuedLines(values.tenantId(), taskLine.id())) {
            issuedByDispense.computeIfAbsent(line.medicationDispenseId(), ignored -> new ArrayList<>()).add(line);
        }
        List<AvailableIssueLine> available = new ArrayList<>();
        BigDecimal totalAvailableBase = BigDecimal.ZERO;
        BigDecimal totalPhysicalBase = BigDecimal.ZERO;
        boolean unitMismatch = false;
        for (Map.Entry<Long, List<MedicationDispenseLine>> entry : issuedByDispense.entrySet()) {
            DispenseIssues dispense = collectDispenseIssues(values, task, entry.getKey(), entry.getValue());
            totalPhysicalBase = totalPhysicalBase.add(dispense.physicalBase());
            totalAvailableBase = totalAvailableBase.add(dispense.availableTotalBase());
            unitMismatch = unitMismatch || dispense.unitMismatch();
            available.addAll(dispense.available());
        }
        return new AvailableIssues(available, totalAvailableBase, totalPhysicalBase, unitMismatch);
    }

    private DispenseIssues collectDispenseIssues(ConsumptionInput values, DispenseTask task, Long dispenseId,
                                                 List<MedicationDispenseLine> issuedLines) {
        MedicationDispense header = dispenses.findByIdAndTenantId(dispenseId, values.tenantId())
                .orElseThrow(() -> conflict("MEDICATION_DISPENSE_NOT_FOUND", "发药事件不存在"));
        List<IssueBalance> balances = new ArrayList<>();
        BigDecimal headerReturnedBase = BigDecimal.ZERO;
        BigDecimal headerConsumedBase = BigDecimal.ZERO;
        BigDecimal headerPhysicalBase = BigDecimal.ZERO;
        boolean unitMismatch = false;
        for (MedicationDispenseLine line : issuedLines) {
            String lineBaseUnit = stockItems.findByIdAndTenantId(line.stockItemId(), values.tenantId())
                    .orElseThrow(() -> conflict("MEDICATION_DISPENSE_STOCK_ITEM_MISSING",
                            "发药批次对应库存项目不存在"))
                    .baseUnitCode();
            if (!values.baseUnit().equalsIgnoreCase(lineBaseUnit)) {
                unitMismatch = true;
                continue;
            }
            BigDecimal returnedBase = dispenseLines.returnedQuantity(values.tenantId(), line.id())
                    .multiply(line.baseQuantityFactor());
            BigDecimal consumedBase = consumptions.consumedBaseQuantity(values.tenantId(), line.id());
            BigDecimal pendingReturnBase = wardReturns.pendingBaseQuantity(values.tenantId(), line.id());
            BigDecimal physicalBase = line.quantityDispensed().multiply(line.baseQuantityFactor())
                    .subtract(returnedBase).subtract(consumedBase).subtract(pendingReturnBase)
                    .max(BigDecimal.ZERO);
            balances.add(new IssueBalance(line, lineBaseUnit, returnedBase, consumedBase, physicalBase));
            headerReturnedBase = headerReturnedBase.add(returnedBase);
            headerConsumedBase = headerConsumedBase.add(consumedBase);
            headerPhysicalBase = headerPhysicalBase.add(physicalBase);
        }
        BigDecimal headerAvailableBase = headerPhysicalBase;
        if ("INPATIENT".equals(task.taskType())) {
            var gate = wardDeliveries.deliveryGate(values.tenantId(), header.id());
            if (!gate.deliveryRequired() || !gate.ready() || gate.receivedQuantity() == null
                    || gate.receivedQuantity().signum() <= 0) {
                return new DispenseIssues(headerPhysicalBase, BigDecimal.ZERO, unitMismatch, List.of());
            }
            MedicationDispenseLine first = balances.isEmpty() ? null : balances.getFirst().line();
            if (first == null || gate.unitCode() == null
                    || !gate.unitCode().equalsIgnoreCase(first.dispenseUnitCode())) {
                return new DispenseIssues(headerPhysicalBase, BigDecimal.ZERO, true, List.of());
            }
            BigDecimal signedNetBase = gate.receivedQuantity().multiply(first.baseQuantityFactor())
                    .subtract(headerReturnedBase).subtract(headerConsumedBase).max(BigDecimal.ZERO);
            headerAvailableBase = headerAvailableBase.min(signedNetBase);
        }
        BigDecimal receiptRemaining = headerAvailableBase;
        List<AvailableIssueLine> available = new ArrayList<>();
        BigDecimal availableTotalBase = BigDecimal.ZERO;
        for (IssueBalance balance : balances) {
            if (receiptRemaining.signum() <= 0) break;
            BigDecimal lineAvailable = balance.physicalBase().min(receiptRemaining);
            if (lineAvailable.signum() <= 0) continue;
            available.add(new AvailableIssueLine(header.id(), balance.line(), balance.baseUnitCode(), lineAvailable));
            availableTotalBase = availableTotalBase.add(lineAvailable);
            receiptRemaining = receiptRemaining.subtract(lineAvailable);
        }
        return new DispenseIssues(headerPhysicalBase, availableTotalBase, unitMismatch, available);
    }

    private void requireSufficientAvailable(ConsumptionInput values, DispenseTask task, AvailableIssues issues) {
        if (issues.totalAvailableBase().compareTo(values.requiredBase()) < 0) {
            if ("INPATIENT".equals(task.taskType())
                    && issues.totalPhysicalBase().compareTo(values.requiredBase()) >= 0) {
                throw conflict("INPATIENT_MEDICATION_WARD_RECEIPT_REQUIRED",
                        "住院用药尚未完成足量病区签收；需要 %s %s，已签收可核销净量 %s %s".formatted(
                                values.requiredBase().stripTrailingZeros().toPlainString(), values.baseUnit(),
                                issues.totalAvailableBase().stripTrailingZeros().toPlainString(), values.baseUnit()));
            }
            String detail = issues.unitMismatch() && issues.totalAvailableBase().signum() == 0
                    ? "；发药基础单位与医嘱不一致" : "";
            throw conflict("INPATIENT_MEDICATION_DISPENSE_QUANTITY_INSUFFICIENT",
                    "住院用药可核销净发药数量不足；需要 %s %s，可用 %s %s%s".formatted(
                            values.requiredBase().stripTrailingZeros().toPlainString(), values.baseUnit(),
                            issues.totalAvailableBase().stripTrailingZeros().toPlainString(), values.baseUnit(), detail));
        }
    }

    private ConsumptionSnapshot persistConsumptions(ConsumptionInput values, List<AvailableIssueLine> available) {
        BigDecimal remaining = values.requiredBase();
        List<MedicationDispenseConsumption> saved = new ArrayList<>();
        for (AvailableIssueLine candidate : available) {
            if (remaining.signum() == 0) break;
            BigDecimal baseTaken = candidate.availableBaseQuantity().min(remaining);
            BigDecimal quantityTaken = baseTaken.divide(candidate.line().baseQuantityFactor(), 8, RoundingMode.HALF_UP);
            saved.add(new MedicationDispenseConsumption(values.tenantId(), values.requestId(), values.consumerType(),
                    values.consumerId(), candidate.line().taskLineId(), candidate.dispenseId(), candidate.line().id(),
                    quantityTaken, candidate.line().dispenseUnitCode(), baseTaken, candidate.baseUnitCode(),
                    values.commandCode(), values.actorId()));
            remaining = remaining.subtract(baseTaken);
        }
        try {
            return snapshot(values.requiredBase(), values.baseUnit(), consumptions.saveAllAndFlush(saved));
        } catch (DataIntegrityViolationException exception) {
            ConsumptionSnapshot concurrentReplay = replay(values.tenantId(), values.requestId(), values.consumerType(),
                    values.consumerId(), values.commandCode(), values.baseUnit());
            if (concurrentReplay != null) return concurrentReplay;
            throw conflict("MEDICATION_CONSUMPTION_CONFLICT", "药品发药数量已被其他执行任务核销，请刷新后重试");
        }
    }

    private DispenseTaskLine taskLineForConsumer(Long tenantId, Long requestId,
                                                  String consumerType, Long consumerId,
                                                  boolean required) {
        DispenseTaskLine result = null;
        if ("INPATIENT_ORDER_TASK".equals(consumerType) && consumerId != null) {
            result = supplyTasks.findByTenantIdAndOrderTaskIdAndStatus(tenantId, consumerId,
                            InpatientMedicationSupplyTaskStatus.ACTIVE)
                    .flatMap(mapping -> supplyLines.findById(mapping.supplyLineId()))
                    .filter(line -> tenantId.equals(line.tenantId())
                            && line.status() == InpatientMedicationSupplyLineStatus.INTAKEN
                            && line.dispenseTaskLineId() != null)
                    .flatMap(line -> lines.findById(line.dispenseTaskLineId()))
                    .filter(line -> tenantId.equals(line.tenantId()) && requestId.equals(line.requestId()))
                    .orElse(null);
        }
        if (result == null) {
            result = lines.findByTenantIdAndFulfillmentSourceTypeAndFulfillmentSourceId(
                    tenantId, "MEDICATION_REQUEST", requestId).orElse(null);
        }
        if (result == null && required) {
            throw conflict("INPATIENT_MEDICATION_DISPENSE_REQUIRED",
                    "当前给药剂次尚未形成对应供药与发药明细，不能登记给药");
        }
        return result;
    }

    @Override
    @Transactional(readOnly = true)
    public List<ConsumptionAllocation> consumptionsFor(Long tenantId, String consumerType, Long consumerId) {
        if (tenantId == null || consumerId == null || consumerType == null || consumerType.isBlank()) return List.of();
        return consumptions.findByTenantIdAndConsumerTypeAndConsumerIdOrderById(
                        tenantId, consumerType.trim().toUpperCase(Locale.ROOT), consumerId).stream()
                .map(this::allocation).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public BigDecimal consumedBaseQuantityForDispenseLine(Long tenantId, Long dispenseLineId) {
        if (tenantId == null || dispenseLineId == null) return BigDecimal.ZERO;
        return consumptions.consumedBaseQuantity(tenantId, dispenseLineId);
    }

    private ConsumptionSnapshot replay(Long tenantId, Long requestId, String consumerType, Long consumerId,
                                       String commandCode, String baseUnit) {
        List<MedicationDispenseConsumption> byCommand = consumptions
                .findByTenantIdAndCommandCodeOrderById(tenantId, commandCode);
        if (!byCommand.isEmpty()) {
            boolean same = byCommand.stream().allMatch(value -> requestId.equals(value.requestId())
                    && consumerType.equals(value.consumerType()) && consumerId.equals(value.consumerId()));
            if (!same) throw conflict("MEDICATION_CONSUMPTION_COMMAND_REUSED", "药品核销业务请求号已被其他任务使用");
            return snapshot(sumBase(byCommand), baseUnit, byCommand);
        }
        List<MedicationDispenseConsumption> byConsumer = consumptions
                .findByTenantIdAndConsumerTypeAndConsumerIdOrderById(tenantId, consumerType, consumerId);
        if (byConsumer.isEmpty()) return null;
        throw conflict("MEDICATION_CONSUMPTION_ALREADY_RECORDED", "该用药执行任务已由其他业务请求完成核销");
    }

    private ConsumptionSnapshot snapshot(BigDecimal requiredBase, String baseUnit,
                                         List<MedicationDispenseConsumption> values) {
        return new ConsumptionSnapshot(requiredBase, baseUnit, values.stream().map(this::allocation).toList());
    }

    private ConsumptionAllocation allocation(MedicationDispenseConsumption value) {
        return new ConsumptionAllocation(value.id(), value.dispenseTaskLineId(), value.dispenseId(), value.dispenseLineId(),
                value.consumedQuantity(), value.dispenseUnitCode(), value.consumedBaseQuantity(),
                value.baseUnitCode(), value.commandCode(), value.consumedAt());
    }

    private static BigDecimal sumBase(List<MedicationDispenseConsumption> values) {
        return values.stream().map(MedicationDispenseConsumption::consumedBaseQuantity)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private static <T> T required(T value, String code, String message) {
        if (value == null) throw badRequest(code, message);
        return value;
    }

    private static String requiredText(String value, String code, String message) {
        if (value == null || value.isBlank()) throw badRequest(code, message);
        return value.trim();
    }

    private static BigDecimal positive(BigDecimal value, String code, String message) {
        if (value == null || value.signum() <= 0) throw badRequest(code, message);
        return value;
    }

    private record AvailableIssueLine(Long dispenseId, MedicationDispenseLine line, String baseUnitCode,
                                      BigDecimal availableBaseQuantity) {
    }

    private record IssueBalance(MedicationDispenseLine line, String baseUnitCode,
                                BigDecimal returnedBase, BigDecimal consumedBase,
                                BigDecimal physicalBase) {
    }

    private record ConsumptionInput(Long tenantId, Long requestId, Long consumerId, Long actorId,
                                    String consumerType, String commandCode, String baseUnit,
                                    BigDecimal requiredBase) {
    }

    private record AvailableIssues(List<AvailableIssueLine> available, BigDecimal totalAvailableBase,
                                   BigDecimal totalPhysicalBase, boolean unitMismatch) {
    }

    private record DispenseIssues(BigDecimal physicalBase, BigDecimal availableTotalBase,
                                  boolean unitMismatch, List<AvailableIssueLine> available) {
    }
}
