package com.rhn.pharmacy.application;

import com.rhn.pharmacy.api.MedicationFulfillmentDirectory;
import com.rhn.pharmacy.api.WardDeliveryDirectory;
import com.rhn.pharmacy.domain.DispenseTask;
import com.rhn.pharmacy.domain.MedicationDispense;
import com.rhn.pharmacy.domain.MedicationDispenseConsumption;
import com.rhn.pharmacy.domain.MedicationDispenseLine;
import com.rhn.pharmacy.domain.DispenseTaskLine;
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
        FulfillmentSnapshot latest = requestLines.stream().map(line -> snapshotForLine(tenantId, line))
                .reduce((first, second) -> second).orElse(FulfillmentSnapshot.pending());
        boolean completed = requestLines.stream().anyMatch(line -> "COMPLETED".equals(line.status()))
                && net.signum() > 0;
        return new FulfillmentSnapshot(completed, latest.dispenseId(), net, latest.status());
    }

    @Override
    @Transactional(readOnly = true)
    public FulfillmentSnapshot fulfillmentForConsumer(Long tenantId, Long medicationRequestId,
                                                      String consumerType, Long consumerId) {
        DispenseTaskLine line = taskLineForConsumer(tenantId, medicationRequestId, consumerType, consumerId, false);
        return line == null ? FulfillmentSnapshot.pending() : snapshotForLine(tenantId, line);
    }

    private FulfillmentSnapshot snapshotForLine(Long tenantId, DispenseTaskLine line) {
        List<MedicationDispense> events = dispenses
                .findByTenantIdAndTaskIdOrderByOccurredAtAscIdAsc(tenantId, line.taskId());
        Long latestDispenseId = events.stream()
                .filter(value -> "DISPENSE".equals(value.dispenseType()) || "REDISPENSE".equals(value.dispenseType()))
                .reduce((first, second) -> second).map(MedicationDispense::id).orElse(null);
        boolean completed = "COMPLETED".equals(line.status()) && line.netDispensedQuantity().signum() > 0;
        return new FulfillmentSnapshot(completed, latestDispenseId, line.netDispensedQuantity(), line.status());
    }

    @Override
    @Transactional
    public ConsumptionSnapshot consume(ConsumptionCommand input) {
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

        ConsumptionSnapshot replay = replay(tenantId, requestId, consumerType, consumerId, commandCode, baseUnit);
        if (replay != null) return replay;
        DispenseTaskLine taskLine = taskLineForConsumer(tenantId, requestId, consumerType, consumerId, true);
        DispenseTask task = tasks.lockByIdAndTenantId(taskLine.taskId(), tenantId)
                .orElseThrow(() -> conflict("MEDICATION_DISPENSE_TASK_MISSING", "药房发药任务不存在"));
        replay = replay(tenantId, requestId, consumerType, consumerId, commandCode, baseUnit);
        if (replay != null) return replay;

        List<AvailableIssueLine> available = new ArrayList<>();
        BigDecimal totalAvailableBase = BigDecimal.ZERO;
        BigDecimal totalPhysicalBase = BigDecimal.ZERO;
        boolean unitMismatch = false;
        Map<Long, List<MedicationDispenseLine>> issuedByDispense = new LinkedHashMap<>();
        for (MedicationDispenseLine line : dispenseLines.findIssuedLines(tenantId, taskLine.id())) {
            issuedByDispense.computeIfAbsent(line.medicationDispenseId(), ignored -> new ArrayList<>()).add(line);
        }
        for (Map.Entry<Long, List<MedicationDispenseLine>> entry : issuedByDispense.entrySet()) {
            MedicationDispense header = dispenses.findByIdAndTenantId(entry.getKey(), tenantId)
                    .orElseThrow(() -> conflict("MEDICATION_DISPENSE_NOT_FOUND", "发药事件不存在"));
            List<IssueBalance> balances = new ArrayList<>();
            BigDecimal headerReturnedBase = BigDecimal.ZERO;
            BigDecimal headerConsumedBase = BigDecimal.ZERO;
            BigDecimal headerPhysicalBase = BigDecimal.ZERO;
            for (MedicationDispenseLine line : entry.getValue()) {
                String lineBaseUnit = stockItems.findByIdAndTenantId(line.stockItemId(), tenantId)
                        .orElseThrow(() -> conflict("MEDICATION_DISPENSE_STOCK_ITEM_MISSING",
                                "发药批次对应库存项目不存在"))
                        .baseUnitCode();
                if (!baseUnit.equalsIgnoreCase(lineBaseUnit)) {
                    unitMismatch = true;
                    continue;
                }
                BigDecimal returnedBase = dispenseLines.returnedQuantity(tenantId, line.id())
                        .multiply(line.baseQuantityFactor());
                BigDecimal consumedBase = consumptions.consumedBaseQuantity(tenantId, line.id());
                BigDecimal pendingReturnBase = wardReturns.pendingBaseQuantity(tenantId, line.id());
                BigDecimal physicalBase = line.quantityDispensed().multiply(line.baseQuantityFactor())
                        .subtract(returnedBase).subtract(consumedBase).subtract(pendingReturnBase)
                        .max(BigDecimal.ZERO);
                balances.add(new IssueBalance(line, lineBaseUnit, returnedBase, consumedBase, physicalBase));
                headerReturnedBase = headerReturnedBase.add(returnedBase);
                headerConsumedBase = headerConsumedBase.add(consumedBase);
                headerPhysicalBase = headerPhysicalBase.add(physicalBase);
            }
            totalPhysicalBase = totalPhysicalBase.add(headerPhysicalBase);
            BigDecimal headerAvailableBase = headerPhysicalBase;
            if ("INPATIENT".equals(task.taskType())) {
                var gate = wardDeliveries.deliveryGate(tenantId, header.id());
                if (!gate.deliveryRequired() || !gate.ready() || gate.receivedQuantity() == null
                        || gate.receivedQuantity().signum() <= 0) {
                    continue;
                }
                MedicationDispenseLine first = balances.isEmpty() ? null : balances.getFirst().line();
                if (first == null || gate.unitCode() == null
                        || !gate.unitCode().equalsIgnoreCase(first.dispenseUnitCode())) {
                    unitMismatch = true;
                    continue;
                }
                BigDecimal signedNetBase = gate.receivedQuantity().multiply(first.baseQuantityFactor())
                        .subtract(headerReturnedBase).subtract(headerConsumedBase).max(BigDecimal.ZERO);
                headerAvailableBase = headerAvailableBase.min(signedNetBase);
            }
            BigDecimal receiptRemaining = headerAvailableBase;
            for (IssueBalance balance : balances) {
                if (receiptRemaining.signum() <= 0) break;
                BigDecimal lineAvailable = balance.physicalBase().min(receiptRemaining);
                if (lineAvailable.signum() <= 0) continue;
                available.add(new AvailableIssueLine(header.id(), balance.line(), balance.baseUnitCode(), lineAvailable));
                totalAvailableBase = totalAvailableBase.add(lineAvailable);
                receiptRemaining = receiptRemaining.subtract(lineAvailable);
            }
        }
        if (totalAvailableBase.compareTo(requiredBase) < 0) {
            if ("INPATIENT".equals(task.taskType()) && totalPhysicalBase.compareTo(requiredBase) >= 0) {
                throw conflict("INPATIENT_MEDICATION_WARD_RECEIPT_REQUIRED",
                        "住院用药尚未完成足量病区签收；需要 %s %s，已签收可核销净量 %s %s".formatted(
                                requiredBase.stripTrailingZeros().toPlainString(), baseUnit,
                                totalAvailableBase.stripTrailingZeros().toPlainString(), baseUnit));
            }
            String detail = unitMismatch && totalAvailableBase.signum() == 0
                    ? "；发药基础单位与医嘱不一致" : "";
            throw conflict("INPATIENT_MEDICATION_DISPENSE_QUANTITY_INSUFFICIENT",
                    "住院用药可核销净发药数量不足；需要 %s %s，可用 %s %s%s".formatted(
                            requiredBase.stripTrailingZeros().toPlainString(), baseUnit,
                            totalAvailableBase.stripTrailingZeros().toPlainString(), baseUnit, detail));
        }

        BigDecimal remaining = requiredBase;
        List<MedicationDispenseConsumption> saved = new ArrayList<>();
        for (AvailableIssueLine candidate : available) {
            if (remaining.signum() == 0) break;
            BigDecimal baseTaken = candidate.availableBaseQuantity().min(remaining);
            BigDecimal quantityTaken = baseTaken.divide(candidate.line().baseQuantityFactor(), 8, RoundingMode.HALF_UP);
            saved.add(new MedicationDispenseConsumption(tenantId, requestId, consumerType, consumerId,
                    candidate.line().taskLineId(), candidate.dispenseId(), candidate.line().id(), quantityTaken,
                    candidate.line().dispenseUnitCode(), baseTaken, candidate.baseUnitCode(), commandCode, actorId));
            remaining = remaining.subtract(baseTaken);
        }
        try {
            return snapshot(requiredBase, baseUnit, consumptions.saveAllAndFlush(saved));
        } catch (DataIntegrityViolationException exception) {
            ConsumptionSnapshot concurrentReplay = replay(tenantId, requestId, consumerType, consumerId,
                    commandCode, baseUnit);
            if (concurrentReplay != null) return concurrentReplay;
            throw conflict("MEDICATION_CONSUMPTION_CONFLICT", "药品发药数量已被其他执行任务核销，请刷新后重试");
        }
    }

    private DispenseTaskLine taskLineForConsumer(Long tenantId, Long requestId,
                                                  String consumerType, Long consumerId,
                                                  boolean required) {
        DispenseTaskLine result = null;
        if ("INPATIENT_ORDER_TASK".equals(consumerType) && consumerId != null) {
            result = supplyTasks.findByTenantIdAndOrderTaskIdAndStatus(tenantId, consumerId, "ACTIVE")
                    .flatMap(mapping -> supplyLines.findById(mapping.supplyLineId()))
                    .filter(line -> tenantId.equals(line.tenantId()) && "INTAKEN".equals(line.status())
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
}
