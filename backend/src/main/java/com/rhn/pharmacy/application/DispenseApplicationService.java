package com.rhn.pharmacy.application;

import com.rhn.pharmacy.api.PharmacyViews.DispenseTraceView;
import com.rhn.pharmacy.api.PharmacyViews.MedicationDispenseLineView;
import com.rhn.pharmacy.api.PharmacyViews.MedicationDispenseView;
import com.rhn.pharmacy.api.PharmacyViews.PreparationResultView;
import com.rhn.pharmacy.api.PharmacyViews.StockReturnLineView;
import com.rhn.pharmacy.api.PharmacyViews.StockReturnView;
import com.rhn.pharmacy.application.InventoryTraceApplicationService.TraceMovementLine;
import com.rhn.pharmacy.application.InventoryTraceApplicationService.TraceReturnLine;
import com.rhn.pharmacy.domain.DispenseTask;
import com.rhn.pharmacy.domain.DispenseTaskLine;
import com.rhn.pharmacy.domain.InventoryBalance;
import com.rhn.pharmacy.domain.InventoryPeriod;
import com.rhn.pharmacy.domain.InventoryReservation;
import com.rhn.pharmacy.domain.InventoryTransaction;
import com.rhn.pharmacy.domain.InventoryTransactionLine;
import com.rhn.pharmacy.domain.MedicationDispense;
import com.rhn.pharmacy.domain.MedicationDispenseLine;
import com.rhn.pharmacy.domain.StockBin;
import com.rhn.pharmacy.domain.StockItem;
import com.rhn.pharmacy.domain.StockLot;
import com.rhn.pharmacy.domain.StockReturn;
import com.rhn.pharmacy.domain.StockReturnLine;
import com.rhn.pharmacy.domain.StockSite;
import com.rhn.pharmacy.infrastructure.DispenseTaskLineRepository;
import com.rhn.pharmacy.infrastructure.DispenseTaskRepository;
import com.rhn.pharmacy.infrastructure.InventoryBalanceRepository;
import com.rhn.pharmacy.infrastructure.InventoryPeriodRepository;
import com.rhn.pharmacy.infrastructure.InventoryReservationRepository;
import com.rhn.pharmacy.infrastructure.InventoryTransactionLineRepository;
import com.rhn.pharmacy.infrastructure.InventoryTransactionRepository;
import com.rhn.pharmacy.infrastructure.MedicationDispenseLineRepository;
import com.rhn.pharmacy.infrastructure.MedicationDispenseRepository;
import com.rhn.pharmacy.infrastructure.StockBinRepository;
import com.rhn.pharmacy.infrastructure.StockItemRepository;
import com.rhn.pharmacy.infrastructure.StockLotRepository;
import com.rhn.pharmacy.infrastructure.StockReturnLineRepository;
import com.rhn.pharmacy.infrastructure.StockReturnRepository;
import com.rhn.pharmacy.infrastructure.StockSiteRepository;
import com.rhn.platform.eventing.api.DomainEventPublisher;
import com.rhn.platform.organization.api.OrganizationDirectory;
import com.rhn.platform.organization.domain.PersonnelStatus;
import com.rhn.platform.organization.domain.PositionType;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class DispenseApplicationService {
    private static final Set<String> RETURN_DISPOSITIONS = Set.of("RESTOCK", "QUARANTINE", "DESTROY");
    private static final DateTimeFormatter NUMBER_TIME = DateTimeFormatter.ofPattern("yyyyMMddHHmmss")
            .withZone(ZoneOffset.UTC);

    private final DispenseTaskRepository taskRepository;
    private final DispenseTaskLineRepository taskLineRepository;
    private final StockSiteRepository siteRepository;
    private final StockItemRepository itemRepository;
    private final StockBinRepository binRepository;
    private final StockLotRepository lotRepository;
    private final InventoryPeriodRepository periodRepository;
    private final InventoryTransactionRepository transactionRepository;
    private final InventoryTransactionLineRepository transactionLineRepository;
    private final InventoryBalanceRepository balanceRepository;
    private final InventoryReservationRepository reservationRepository;
    private final MedicationDispenseRepository dispenseRepository;
    private final MedicationDispenseLineRepository dispenseLineRepository;
    private final StockReturnRepository returnRepository;
    private final StockReturnLineRepository returnLineRepository;
    private final OrganizationDirectory organizationDirectory;
    private final InventoryTraceApplicationService traceService;
    private final InventoryQuantityPolicy quantityPolicy;
    private final InventorySplitApplicationService splitService;
    private final DomainEventPublisher eventPublisher;
    private final ExecutionContextProvider contextProvider;

    public DispenseApplicationService(
            DispenseTaskRepository taskRepository, DispenseTaskLineRepository taskLineRepository,
            StockSiteRepository siteRepository, StockItemRepository itemRepository,
            StockBinRepository binRepository, StockLotRepository lotRepository,
            InventoryPeriodRepository periodRepository, InventoryTransactionRepository transactionRepository,
            InventoryTransactionLineRepository transactionLineRepository,
            InventoryBalanceRepository balanceRepository, InventoryReservationRepository reservationRepository,
            MedicationDispenseRepository dispenseRepository,
            MedicationDispenseLineRepository dispenseLineRepository,
            StockReturnRepository returnRepository, StockReturnLineRepository returnLineRepository,
            OrganizationDirectory organizationDirectory, InventoryTraceApplicationService traceService,
            InventoryQuantityPolicy quantityPolicy, InventorySplitApplicationService splitService,
            DomainEventPublisher eventPublisher,
            ExecutionContextProvider contextProvider) {
        this.taskRepository = taskRepository; this.taskLineRepository = taskLineRepository;
        this.siteRepository = siteRepository; this.itemRepository = itemRepository;
        this.binRepository = binRepository; this.lotRepository = lotRepository;
        this.periodRepository = periodRepository; this.transactionRepository = transactionRepository;
        this.transactionLineRepository = transactionLineRepository; this.balanceRepository = balanceRepository;
        this.reservationRepository = reservationRepository; this.dispenseRepository = dispenseRepository;
        this.dispenseLineRepository = dispenseLineRepository; this.returnRepository = returnRepository;
        this.returnLineRepository = returnLineRepository; this.organizationDirectory = organizationDirectory;
        this.traceService = traceService; this.quantityPolicy = quantityPolicy; this.splitService = splitService;
        this.eventPublisher = eventPublisher; this.contextProvider = contextProvider;
    }

    @Transactional
    public PreparationResultView completePicking(Long taskId, CompletePickingCommand input) {
        ExecutionContext context = requireWorkContext(); DispenseTask task = lockTask(context, taskId);
        StockSite site = requireSite(context, task.stockSiteId()); requireOrganizationAccess(context, site.organizationId());
        validatePractitioner(context, site, input.pickerPractitionerId(), input.pickerAssignmentId(), "配药");
        DispenseTaskLine line = requireTaskLine(context, task.id());
        List<InventoryReservation> active = reservationRepository.lockActiveByRequest(context.tenantId(), line.requestId());
        if (active.isEmpty() || active.stream().anyMatch(value -> value.expiresAt() != null
                && !value.expiresAt().isAfter(Instant.now()))) {
            throw conflict("DISPENSE_PREPARATION_RESERVATION_INVALID", "配药复核前必须存在未过期的有效库存预留");
        }
        BigDecimal required = line.remainingQuantity().multiply(line.baseQuantityFactor());
        BigDecimal reserved = active.stream().map(InventoryReservation::releasableQuantity)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        if (reserved.compareTo(required) != 0) throw conflict(
                "DISPENSE_PREPARATION_RESERVATION_INCOMPLETE", "有效库存预留必须完整覆盖任务剩余计划量");
        String description = clean(input.description());
        task.completePicking(input.pickerPractitionerId(), context.subjectId(), input.pickerAssignmentId(), description);
        line.completePicking(); taskRepository.flush(); taskLineRepository.flush();
        publish(context, site, task, "DISPENSE_PREPARATION_COMPLETED", Map.of(
                "requestId", line.requestId(), "pickerPractitionerId", input.pickerPractitionerId()));
        return new PreparationResultView(task.id(), task.taskNo(), task.status(), task.pickedAt(),
                task.assignedPractitionerId(), task.pickedByUserId(), task.pickedAssignmentId(), task.pickDescription());
    }

    @Transactional
    public MedicationDispenseView dispense(Long taskId, DispenseCommand input) {
        ExecutionContext context = requireWorkContext(); String requestCode = required(input.requestCode(),
                "MEDICATION_DISPENSE_REQUEST_CODE_REQUIRED", "发药请求编码不能为空");
        BigDecimal quantity = positive(input.operationQuantity(), "MEDICATION_DISPENSE_QUANTITY_INVALID", "发药数量必须大于零");
        MedicationDispense existing = dispenseRepository.findByTenantIdAndDispenseNo(
                context.tenantId(), requestCode).orElse(null);
        if (existing != null) return verifyIdempotentDispense(existing, taskId, input);

        DispenseTask task = lockTask(context, taskId); StockSite site = requireSite(context, task.stockSiteId());
        requireOrganizationAccess(context, site.organizationId()); DispenseTaskLine taskLine = requireTaskLine(context, task.id());
        StockItem item = requireItem(context, taskLine.stockItemId());
        quantity = quantityPolicy.require(context.tenantId(), taskLine.dispenseUnitCode(), quantity,
                "MEDICATION_DISPENSE_QUANTITY_PRECISION_INVALID", "发药数量");
        if (item.controlled() || item.highAlert()) throw conflict("SPECIAL_MEDICATION_DUAL_CONFIRMATION_REQUIRED",
                "受控或高警示药品必须通过独立二次身份确认流程，普通发药接口不允许代替双人确认");
        validatePractitioner(context, site, input.dispenserPractitionerId(), input.dispenserAssignmentId(), "发药");
        validateChecker(context, site, input);
        if (quantity.compareTo(taskLine.remainingQuantity()) > 0) {
            throw conflict("MEDICATION_DISPENSE_EXCEEDS_REMAINING", "发药数量超过任务剩余计划量");
        }
        Instant occurredAt = input.occurredAt() == null ? Instant.now() : input.occurredAt();
        List<InventoryReservation> reservations = reservationRepository.lockActiveByRequest(
                context.tenantId(), taskLine.requestId());
        if (reservations.stream().anyMatch(value -> value.expiresAt() != null && !value.expiresAt().isAfter(Instant.now()))) {
            throw conflict("MEDICATION_DISPENSE_RESERVATION_EXPIRED", "库存预留已到期，不能继续发药");
        }
        BigDecimal baseRequired = quantityPolicy.toBase(context.tenantId(), taskLine.dispenseUnitCode(), quantity,
                taskLine.baseQuantityFactor(), item.baseUnitCode(),
                "MEDICATION_DISPENSE_QUANTITY_PRECISION_INVALID", "发药数量");
        BigDecimal reserved = reservations.stream().map(InventoryReservation::releasableQuantity)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        if (reserved.compareTo(baseRequired) < 0) {
            throw conflict("MEDICATION_DISPENSE_RESERVATION_INSUFFICIENT", "有效预留余量不足，不能完成本次发药");
        }
        LocalDate date = occurredAt.atZone(ZoneOffset.UTC).toLocalDate();
        InventoryPeriod period = requireOpenPeriod(context, site.id(), date);
        InventoryTransaction transaction = transactionRepository.save(new InventoryTransaction(context.tenantId(),
                period.id(), nextNo("IT"), requestCode, "DISPENSE", "MEDICATION_DISPENSE",
                requestCode, occurredAt, context.subjectId(), clean(input.description())));
        MedicationDispense event = dispenseRepository.save(new MedicationDispense(context.tenantId(), task.id(),
                task.residentId(), task.encounterId(), site.id(), null, requestCode, "DISPENSE", occurredAt,
                input.dispenserPractitionerId(), context.subjectId(), input.dispenserAssignmentId(),
                input.checkerPractitionerId(), input.checkerPractitionerId() == null ? null : context.subjectId(),
                input.checkerAssignmentId(), quantity, taskLine.dispenseUnitCode(), clean(input.description())));

        BigDecimal remaining = baseRequired; int order = 1; List<MedicationDispenseLine> eventLines = new ArrayList<>();
        for (InventoryReservation reservation : reservations) {
            if (remaining.signum() == 0) break;
            BigDecimal allocation = reservation.releasableQuantity().min(remaining);
            InventoryBalance balance = balanceRepository.lockDimension(context.tenantId(), reservation.stockBinId(),
                    reservation.stockItemId(), reservation.stockLotId(), "AVAILABLE")
                    .orElseThrow(() -> conflict("INVENTORY_BALANCE_NOT_FOUND", "预留对应库存投影不存在"));
            if (taskLine.split()) {
                splitService.consumeForDispense(context, site, item, reservation.stockBinId(),
                        reservation.stockLotId(), allocation, event.id(), event.dispenseNo(), occurredAt);
            } else {
                splitService.ensureSealedAvailable(context.tenantId(), reservation.stockBinId(), item.id(),
                        reservation.stockLotId(), balance.quantityOnHand(), allocation);
            }
            balance.dispenseReserved(allocation); reservation.consume(allocation, context.subjectId(), occurredAt);
            BigDecimal operation = allocation.divide(taskLine.baseQuantityFactor());
            InventoryTransactionLine transactionLine = transactionLineRepository.save(new InventoryTransactionLine(
                    context.tenantId(), transaction.id(), order, site.id(), reservation.stockBinId(),
                    reservation.stockItemId(), reservation.stockLotId(), taskLine.packageId(), "AVAILABLE",
                    operation, taskLine.dispenseUnitCode(), taskLine.baseQuantityFactor(), allocation.negate(),
                    balance.averageUnitCost()));
            eventLines.add(dispenseLineRepository.save(new MedicationDispenseLine(context.tenantId(), event.id(),
                    taskLine.id(), null, order, reservation.stockBinId(), reservation.stockItemId(),
                    reservation.stockLotId(), transactionLine.id(), operation, taskLine.dispenseUnitCode(),
                    taskLine.baseQuantityFactor())));
            remaining = remaining.subtract(allocation); order++;
        }
        if (!taskLine.split()) {
            traceService.issue(context, site.id(), "MEDICATION_DISPENSE", event.id(), event.dispenseNo(),
                    eventLines.stream().map(line -> new TraceMovementLine(line.stockItemId(), line.stockLotId(),
                            line.quantityDispensed().multiply(line.baseQuantityFactor()))).toList());
        }
        taskLine.recordDispense(quantity); task.recordDispense(taskLine.remainingQuantity().signum() == 0);
        balanceRepository.flush(); reservationRepository.flush(); transactionLineRepository.flush();
        dispenseLineRepository.flush(); taskLineRepository.flush(); taskRepository.flush();
        publish(context, site, task, "MEDICATION_DISPENSE_POSTED", Map.of("dispenseId", event.id(),
                "dispenseNo", event.dispenseNo(), "operationQuantity", quantity,
                "inventoryTransactionId", transaction.id(), "partial", !"COMPLETED".equals(task.status())));
        return dispenseView(context, event, eventLines);
    }

    @Transactional
    public StockReturnView returnMedication(Long originalDispenseId, ReturnCommand input) {
        ExecutionContext context = requireWorkContext(); String returnNo = required(input.returnNo(),
                "STOCK_RETURN_NO_REQUIRED", "退药请求编码不能为空");
        StockReturn existing = returnRepository.findByTenantIdAndReturnNo(context.tenantId(), returnNo).orElse(null);
        if (existing != null) return verifyIdempotentReturn(context, existing, originalDispenseId, input);
        MedicationDispense original = dispenseRepository.lockByIdAndTenantId(originalDispenseId, context.tenantId())
                .orElseThrow(() -> notFound("MEDICATION_DISPENSE_NOT_FOUND", "未找到原发药事件"));
        if (!Set.of("DISPENSE", "REDISPENSE").contains(original.dispenseType())) {
            throw conflict("STOCK_RETURN_ORIGINAL_TYPE_INVALID", "退药只能关联实际发药或补发事件");
        }
        DispenseTask task = lockTask(context, original.taskId());
        if (!"COMPLETED".equals(task.status()) && !"PARTIALLY_RETURNED".equals(task.status())) {
            throw conflict("STOCK_RETURN_TASK_NOT_COMPLETED", "部分发药任务需先完成剩余发药或释放后另行处置，当前不能退药");
        }
        StockSite site = requireSite(context, original.stockSiteId()); requireOrganizationAccess(context, site.organizationId());
        DispenseTaskLine taskLine = requireTaskLine(context, task.id());
        validatePractitioner(context, site, input.processorPractitionerId(), input.processorAssignmentId(), "退药确认");
        if (input.lines() == null || input.lines().isEmpty()) throw badRequest(
                "STOCK_RETURN_LINES_REQUIRED", "退药必须至少选择一条原发药批次明细");
        String reasonCode = required(input.reasonCode(), "STOCK_RETURN_REASON_REQUIRED", "退药必须填写原因编码");
        Instant occurredAt = input.occurredAt() == null ? Instant.now() : input.occurredAt();
        LocalDate date = occurredAt.atZone(ZoneOffset.UTC).toLocalDate(); InventoryPeriod period = requireOpenPeriod(context, site.id(), date);
        Map<Long, MedicationDispenseLine> originals = new HashMap<>();
        for (MedicationDispenseLine line : dispenseLineRepository.findByTenantIdAndMedicationDispenseIdOrderBySortOrder(
                context.tenantId(), original.id())) originals.put(line.id(), line);
        BigDecimal total = BigDecimal.ZERO;
        java.util.HashSet<Long> requestedOriginalLines = new java.util.HashSet<>();
        for (ReturnLineCommand command : input.lines()) {
            if (!requestedOriginalLines.add(command.originalDispenseLineId())) throw badRequest(
                    "STOCK_RETURN_LINE_DUPLICATE", "同一原发药批次明细不能在一次退药中重复提交");
            MedicationDispenseLine line = originals.get(command.originalDispenseLineId());
            if (line == null) throw badRequest("STOCK_RETURN_LINE_ORIGINAL_MISMATCH", "退药批次明细不属于原发药事件");
            BigDecimal quantity = quantityPolicy.require(context.tenantId(), line.dispenseUnitCode(),
                    positive(command.quantity(), "STOCK_RETURN_QUANTITY_INVALID", "退药数量必须大于零"),
                    "STOCK_RETURN_QUANTITY_PRECISION_INVALID", "退药数量");
            BigDecimal already = dispenseLineRepository.returnedQuantity(context.tenantId(), line.id());
            if (already.add(quantity).compareTo(line.quantityDispensed()) > 0) {
                throw conflict("STOCK_RETURN_EXCEEDS_DISPENSED", "累计退药数量超过原批次实际发药数量");
            }
            String disposition = upper(command.disposition());
            if (!RETURN_DISPOSITIONS.contains(disposition)) throw badRequest(
                    "STOCK_RETURN_DISPOSITION_INVALID", "患者退药处置仅支持重新入库、隔离或待销毁");
            if (taskLine.split() && taskLine.traceRequired() && !"RESTOCK".equals(disposition)) {
                throw conflict("TRACE_PARTIAL_RETURN_DISPOSITION_UNSUPPORTED",
                        "带追溯码的拆零退药当前仅支持可再销售入库；隔离或待销毁需先走异常追溯处置");
            }
            total = total.add(quantity);
        }
        InventoryTransaction transaction = transactionRepository.save(new InventoryTransaction(context.tenantId(),
                period.id(), nextNo("IT"), returnNo, "RETURN", "PATIENT_RETURN", returnNo,
                occurredAt, context.subjectId(), clean(input.description())));
        MedicationDispense returnEvent = dispenseRepository.save(new MedicationDispense(context.tenantId(), task.id(),
                task.residentId(), task.encounterId(), site.id(), original.id(), returnNo, "RETURN", occurredAt,
                input.processorPractitionerId(), context.subjectId(), input.processorAssignmentId(), null, null,
                null, total, original.operationUnitCode(), clean(input.description())));
        StockReturn stockReturn = returnRepository.save(new StockReturn(context.tenantId(), site.id(), task.residentId(),
                original.id(), returnEvent.id(), returnNo, reasonCode, occurredAt, context.subjectId(), clean(input.description())));
        List<MedicationDispenseLine> returnEventLines = new ArrayList<>(); List<StockReturnLine> returnLines = new ArrayList<>();
        List<TraceReturnLine> traceReturns = new ArrayList<>();
        BigDecimal taskReturned = BigDecimal.ZERO; int order = 1;
        for (ReturnLineCommand command : input.lines()) {
            MedicationDispenseLine originalLine = originals.get(command.originalDispenseLineId());
            String disposition = upper(command.disposition()); String stockStatus = switch (disposition) {
                case "RESTOCK" -> "AVAILABLE"; case "QUARANTINE" -> "QUARANTINE"; default -> "DAMAGED";
            };
            BigDecimal returnQuantity = quantityPolicy.require(context.tenantId(), originalLine.dispenseUnitCode(),
                    command.quantity(), "STOCK_RETURN_QUANTITY_PRECISION_INVALID", "退药数量");
            StockItem returnItem = requireItem(context, originalLine.stockItemId());
            BigDecimal baseQuantity = quantityPolicy.toBase(context.tenantId(), originalLine.dispenseUnitCode(),
                    returnQuantity, originalLine.baseQuantityFactor(), returnItem.baseUnitCode(),
                    "STOCK_RETURN_QUANTITY_PRECISION_INVALID", "退药数量");
            InventoryTransactionLine originalTransactionLine = transactionLineRepository.findById(originalLine.inventoryTransactionLineId())
                    .filter(value -> value.tenantId().equals(context.tenantId()))
                    .orElseThrow(() -> conflict("STOCK_RETURN_ORIGINAL_TRANSACTION_MISSING", "原发药库存分录不存在"));
            InventoryBalance balance = balanceRepository.lockDimension(context.tenantId(), originalLine.stockBinId(),
                    originalLine.stockItemId(), originalLine.stockLotId(), stockStatus).orElseGet(() ->
                    new InventoryBalance(context.tenantId(), site.id(), originalLine.stockBinId(),
                            originalLine.stockItemId(), originalLine.stockLotId(), stockStatus,
                            requireItem(context, originalLine.stockItemId()).baseUnitCode()));
            balance.receive(baseQuantity, originalTransactionLine.unitCost()); balanceRepository.save(balance);
            if (taskLine.split() && "RESTOCK".equals(disposition)) {
                splitService.returnFromDispense(context, returnItem, originalLine.stockBinId(),
                        originalLine.stockLotId(), baseQuantity, original.id(), stockReturn.id(), returnNo, occurredAt);
            }
            InventoryTransactionLine transactionLine = transactionLineRepository.save(new InventoryTransactionLine(
                    context.tenantId(), transaction.id(), order, site.id(), originalLine.stockBinId(),
                    originalLine.stockItemId(), originalLine.stockLotId(), taskLine.packageId(), stockStatus,
                    returnQuantity, originalLine.dispenseUnitCode(),
                    originalLine.baseQuantityFactor(), baseQuantity, originalTransactionLine.unitCost()));
            MedicationDispenseLine returnEventLine = dispenseLineRepository.save(new MedicationDispenseLine(
                    context.tenantId(), returnEvent.id(), originalLine.taskLineId(), originalLine.id(), order,
                    originalLine.stockBinId(), originalLine.stockItemId(), originalLine.stockLotId(), transactionLine.id(),
                    returnQuantity, originalLine.dispenseUnitCode(), originalLine.baseQuantityFactor()));
            returnEventLines.add(returnEventLine);
            returnLines.add(returnLineRepository.save(new StockReturnLine(context.tenantId(), stockReturn.id(),
                    originalLine.id(), order, originalLine.stockBinId(), originalLine.stockItemId(),
                    originalLine.stockLotId(), transactionLine.id(), returnQuantity, originalLine.dispenseUnitCode(),
                    originalLine.baseQuantityFactor(), disposition, clean(command.exceptionDescription()))));
            String traceStatus = switch (disposition) { case "RESTOCK" -> "AVAILABLE";
                case "QUARANTINE" -> "QUARANTINED"; default -> "DAMAGED"; };
            if (!taskLine.split()) traceReturns.add(new TraceReturnLine(originalLine.stockItemId(), originalLine.stockLotId(),
                    originalLine.stockBinId(), baseQuantity, traceStatus));
            taskReturned = taskReturned.add(returnQuantity); order++;
        }
        if (!taskLine.split()) {
            traceService.returnMedication(context, site.id(), original.id(), returnEvent.id(), returnNo, traceReturns);
        }
        taskLine.recordReturn(taskReturned);
        task.recordReturn(taskLine.netDispensedQuantity().signum() == 0);
        balanceRepository.flush(); transactionLineRepository.flush(); dispenseLineRepository.flush();
        returnLineRepository.flush(); taskLineRepository.flush(); taskRepository.flush();
        publish(context, site, task, "MEDICATION_RETURN_POSTED", Map.of("returnId", stockReturn.id(),
                "returnNo", stockReturn.returnNo(), "originalDispenseId", original.id(),
                "operationQuantity", total, "inventoryTransactionId", transaction.id()));
        return returnView(context, stockReturn, returnLines);
    }

    @Transactional(readOnly = true)
    public DispenseTraceView trace(Long taskId) {
        ExecutionContext context = requireWorkContext(); DispenseTask task = requireTask(context, taskId);
        StockSite site = requireSite(context, task.stockSiteId()); requireOrganizationAccess(context, site.organizationId());
        DispenseTaskLine line = requireTaskLine(context, task.id());
        List<MedicationDispense> events = dispenseRepository.findByTenantIdAndTaskIdOrderByOccurredAtAscIdAsc(
                context.tenantId(), task.id());
        List<StockReturnView> returns = new ArrayList<>();
        for (MedicationDispense event : events) {
            if (!"DISPENSE".equals(event.dispenseType()) && !"REDISPENSE".equals(event.dispenseType())) continue;
            for (StockReturn value : returnRepository.findByTenantIdAndOriginalDispenseIdOrderByRequestedAt(
                    context.tenantId(), event.id())) {
                returns.add(returnView(context, value, returnLineRepository
                        .findByTenantIdAndStockReturnIdOrderBySortOrder(context.tenantId(), value.id())));
            }
        }
        return new DispenseTraceView(task.id(), task.taskNo(), task.status(), line.plannedQuantity(),
                line.dispensedQuantity(), line.returnedQuantity(), line.netDispensedQuantity(),
                line.dispenseUnitCode(), events.stream().map(value -> dispenseView(context, value,
                        dispenseLineRepository.findByTenantIdAndMedicationDispenseIdOrderBySortOrder(
                                context.tenantId(), value.id()))).toList(), returns);
    }

    private MedicationDispenseView verifyIdempotentDispense(MedicationDispense value, Long taskId, DispenseCommand input) {
        if (!"DISPENSE".equals(value.dispenseType()) || !value.taskId().equals(taskId)
                || value.operationQuantity().compareTo(input.operationQuantity()) != 0) {
            throw conflict("MEDICATION_DISPENSE_REQUEST_REUSED", "相同发药请求编码不能用于不同内容");
        }
        ExecutionContext context = requireWorkContext(); DispenseTask task = requireTask(context, value.taskId());
        StockSite site = requireSite(context, task.stockSiteId()); requireOrganizationAccess(context, site.organizationId());
        return dispenseView(context, value,
                dispenseLineRepository.findByTenantIdAndMedicationDispenseIdOrderBySortOrder(context.tenantId(), value.id()));
    }

    private StockReturnView verifyIdempotentReturn(ExecutionContext context, StockReturn value,
                                                    Long originalDispenseId, ReturnCommand input) {
        StockSite site = requireSite(context, value.stockSiteId()); requireOrganizationAccess(context, site.organizationId());
        List<StockReturnLine> lines = returnLineRepository.findByTenantIdAndStockReturnIdOrderBySortOrder(
                context.tenantId(), value.id());
        if (!value.originalDispenseId().equals(originalDispenseId) || input.lines() == null
                || lines.size() != input.lines().size()) {
            throw conflict("STOCK_RETURN_REQUEST_REUSED", "相同退药请求编码不能用于不同内容");
        }
        for (int index = 0; index < lines.size(); index++) {
            StockReturnLine actual = lines.get(index); ReturnLineCommand expected = input.lines().get(index);
            if (!actual.originalDispenseLineId().equals(expected.originalDispenseLineId())
                    || actual.quantityAccepted().compareTo(expected.quantity()) != 0
                    || !actual.disposition().equals(upper(expected.disposition()))) {
                throw conflict("STOCK_RETURN_REQUEST_REUSED", "相同退药请求编码不能用于不同内容");
            }
        }
        return returnView(context, value, lines);
    }

    private MedicationDispenseView dispenseView(ExecutionContext context, MedicationDispense value,
                                                 List<MedicationDispenseLine> lines) {
        return new MedicationDispenseView(value.id(), value.taskId(), value.residentId(), value.encounterId(),
                value.stockSiteId(), value.originalDispenseId(), value.dispenseNo(), value.dispenseType(),
                value.occurredAt(), value.dispenserPractitionerId(), value.dispenserUserId(),
                value.dispenserAssignmentId(), value.checkerPractitionerId(), value.checkerUserId(),
                value.checkerAssignmentId(), value.checkedAt(), value.operationQuantity(), value.operationUnitCode(),
                value.description(), lines.stream().map(line -> dispenseLineView(context, line)).toList());
    }

    private MedicationDispenseLineView dispenseLineView(ExecutionContext context, MedicationDispenseLine value) {
        StockBin bin = requireBin(context, value.stockBinId()); StockLot lot = requireLot(context, value.stockLotId());
        return new MedicationDispenseLineView(value.id(), value.taskLineId(), value.originalDispenseLineId(),
                value.sortOrder(), value.stockBinId(), bin.code(), value.stockItemId(), value.stockLotId(),
                lot.lotNo(), lot.expiryDate(), value.inventoryTransactionLineId(), value.quantityDispensed(),
                value.dispenseUnitCode(), value.baseQuantityFactor());
    }

    private StockReturnView returnView(ExecutionContext context, StockReturn value, List<StockReturnLine> lines) {
        return new StockReturnView(value.id(), value.revision(), value.stockSiteId(), value.residentId(),
                value.originalDispenseId(), value.returnDispenseId(), value.returnNo(), value.returnType(),
                value.status(), value.reasonCode(), value.requestedAt(), value.confirmedAt(), value.confirmedBy(),
                value.description(), lines.stream().map(this::returnLineView).toList());
    }

    private StockReturnLineView returnLineView(StockReturnLine value) {
        return new StockReturnLineView(value.id(), value.originalDispenseLineId(), value.sortOrder(),
                value.stockBinId(), value.stockItemId(), value.stockLotId(), value.inventoryTransactionLineId(),
                value.quantityAccepted(), value.returnUnitCode(), value.baseQuantityFactor(), value.disposition(),
                value.exceptionDescription());
    }

    private void validateChecker(ExecutionContext context, StockSite site, DispenseCommand input) {
        boolean any = input.checkerPractitionerId() != null || input.checkerAssignmentId() != null;
        if (!any) return;
        if (input.checkerPractitionerId() == null || input.checkerAssignmentId() == null) throw badRequest(
                "DISPENSE_CHECKER_INCOMPLETE", "复核药师和任职必须同时填写");
        if (input.checkerPractitionerId().equals(input.dispenserPractitionerId())) throw conflict(
                "DISPENSE_CHECKER_MUST_DIFFER", "发药人与复核药师必须为不同人员");
        validatePractitioner(context, site, input.checkerPractitionerId(), input.checkerAssignmentId(), "发药复核");
    }

    private void validatePractitioner(ExecutionContext context, StockSite site, Long practitionerId,
                                      Long assignmentId, String action) {
        if (practitionerId == null || assignmentId == null) throw badRequest(
                "PHARMACY_PRACTITIONER_REQUIRED", action + "必须登记药师及任职");
        var staff = organizationDirectory.requireStaff(context.tenantId(), practitionerId); LocalDate today = LocalDate.now();
        boolean employed = staff.employments().stream().anyMatch(value -> value.organizationId().equals(site.organizationId())
                && value.sdPersonnelStatus() == PersonnelStatus.ACTIVE && !value.hireDate().isAfter(today)
                && (value.leaveDate() == null || !value.leaveDate().isBefore(today)));
        var assignment = staff.assignments().stream().filter(value -> value.id().equals(assignmentId)).findFirst()
                .orElseThrow(() -> badRequest("PHARMACY_ASSIGNMENT_INVALID", action + "任职不属于当前药师"));
        if (assignment.sdPositionType() != PositionType.PHARMACY) {
            throw conflict("PHARMACY_POSITION_TYPE_REQUIRED", action + "任职必须使用药学岗位");
        }
        boolean active = assignment.organizationId().equals(site.organizationId())
                && assignment.sdPersonnelStatus() == PersonnelStatus.ACTIVE && !assignment.validFrom().isAfter(today)
                && (assignment.validTo() == null || !assignment.validTo().isBefore(today));
        if (!employed || !active) throw conflict(
                "PHARMACY_PRACTITIONER_NOT_ACTIVE", action + "药师在当前机构没有有效任职");
        if (context.departmentId() != null && !context.departmentId().equals(assignment.departmentId())) {
            throw badRequest("PHARMACY_ASSIGNMENT_CONTEXT_MISMATCH", action + "任职必须与当前工作科室一致");
        }
    }

    private InventoryPeriod requireOpenPeriod(ExecutionContext context, Long siteId, LocalDate date) {
        YearMonth month = YearMonth.from(date); String code = month.toString().replace("-", "");
        InventoryPeriod value = periodRepository.findByTenantIdAndStockSiteIdAndPeriodCode(
                context.tenantId(), siteId, code).orElse(null);
        if (value == null) value = periodRepository.saveAndFlush(new InventoryPeriod(context.tenantId(), siteId,
                code, month.atDay(1), month.atEndOfMonth(), context.subjectId()));
        if (!value.accepts(date)) throw conflict("INVENTORY_PERIOD_NOT_OPEN", "业务日期所属库存期间未开放");
        return value;
    }

    private DispenseTask lockTask(ExecutionContext context, Long id) {
        return taskRepository.lockByIdAndTenantId(id, context.tenantId())
                .orElseThrow(() -> notFound("DISPENSE_TASK_NOT_FOUND", "未找到发药任务"));
    }
    private DispenseTask requireTask(ExecutionContext context, Long id) {
        return taskRepository.findByIdAndTenantId(id, context.tenantId())
                .orElseThrow(() -> notFound("DISPENSE_TASK_NOT_FOUND", "未找到发药任务"));
    }
    private DispenseTaskLine requireTaskLine(ExecutionContext context, Long taskId) {
        return taskLineRepository.findByTenantIdAndTaskId(context.tenantId(), taskId)
                .orElseThrow(() -> notFound("DISPENSE_TASK_LINE_NOT_FOUND", "发药任务缺少药品明细"));
    }
    private StockSite requireSite(ExecutionContext context, Long id) {
        StockSite site = siteRepository.findByIdAndTenantId(id, context.tenantId())
                .orElseThrow(() -> notFound("STOCK_SITE_NOT_FOUND", "未找到库存站点"));
        requireOrganizationAccess(context, site.organizationId());
        if (site.departmentId() != null && !site.departmentId().equals(context.departmentId())) {
            throw badRequest("PHARMACY_SITE_CONTEXT_MISMATCH", "当前工作科室与库存站点所属科室不一致");
        }
        return site;
    }
    private StockItem requireItem(ExecutionContext context, Long id) {
        return itemRepository.findByIdAndTenantId(id, context.tenantId())
                .orElseThrow(() -> notFound("STOCK_ITEM_NOT_FOUND", "未找到库存经营项目"));
    }
    private StockBin requireBin(ExecutionContext context, Long id) {
        return binRepository.findByIdAndTenantId(id, context.tenantId())
                .orElseThrow(() -> notFound("STOCK_BIN_NOT_FOUND", "未找到库存货位"));
    }
    private StockLot requireLot(ExecutionContext context, Long id) {
        return lotRepository.findByIdAndTenantId(id, context.tenantId())
                .orElseThrow(() -> notFound("STOCK_LOT_NOT_FOUND", "未找到库存批次"));
    }
    private ExecutionContext requireWorkContext() {
        ExecutionContext context = contextProvider.requireCurrent();
        if (!context.hasWorkContext()) throw badRequest("PHARMACY_WORK_CONTEXT_REQUIRED", "药房操作必须选择工作机构和科室");
        return context;
    }
    private void requireOrganizationAccess(ExecutionContext context, Long organizationId) {
        if (!context.canAccessOrganization(organizationId)) throw badRequest(
                "PHARMACY_ORGANIZATION_SCOPE_INVALID", "当前工作上下文不能访问该机构药房");
    }
    private void publish(ExecutionContext context, StockSite site, DispenseTask task,
                         String type, Map<String, Object> details) {
        eventPublisher.publish(context.tenantId(), site.organizationId(), type, 1, "DispenseTask", task.id(),
                task.revision(), task.residentId(), Instant.now(), details);
    }
    private String nextNo(String prefix) { return prefix + NUMBER_TIME.format(Instant.now())
            + com.rhn.shared.id.GlobalIds.randomSuffix(6); }
    private BigDecimal positive(BigDecimal value, String code, String message) {
        if (value == null || value.signum() <= 0) throw badRequest(code, message); return value;
    }
    private String required(String value, String code, String message) {
        String result = clean(value); if (result == null) throw badRequest(code, message); return result;
    }
    private String clean(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    private String upper(String value) { String result = clean(value); return result == null ? null : result.toUpperCase(); }

    public record CompletePickingCommand(Long pickerPractitionerId, Long pickerAssignmentId, String description) {}
    public record DispenseCommand(String requestCode, BigDecimal operationQuantity, Instant occurredAt,
                                  Long dispenserPractitionerId, Long dispenserAssignmentId,
                                  Long checkerPractitionerId, Long checkerAssignmentId, String description) {}
    public record ReturnLineCommand(Long originalDispenseLineId, BigDecimal quantity,
                                    String disposition, String exceptionDescription) {}
    public record ReturnCommand(String returnNo, String reasonCode, Instant occurredAt,
                                Long processorPractitionerId, Long processorAssignmentId,
                                String description, List<ReturnLineCommand> lines) {}
}
