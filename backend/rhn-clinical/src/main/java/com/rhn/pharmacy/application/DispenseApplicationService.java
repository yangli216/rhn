package com.rhn.pharmacy.application;

import com.rhn.platform.numbering.api.BusinessNumberGenerator;
import com.rhn.platform.numbering.api.BusinessNumberContext;
import com.rhn.pharmacy.api.MedicationFulfillmentDirectory;
import com.rhn.pharmacy.api.PharmacyViews.DispenseCancelResultView;
import com.rhn.pharmacy.api.PharmacyViews.DispenseTraceView;
import com.rhn.pharmacy.api.PharmacyViews.InventoryTransactionLineView;
import com.rhn.pharmacy.api.PharmacyViews.InventoryTransactionView;
import com.rhn.pharmacy.api.PharmacyViews.MedicationDispenseLineView;
import com.rhn.pharmacy.api.PharmacyViews.MedicationDispenseView;
import com.rhn.pharmacy.api.PharmacyViews.PreparationResultView;
import com.rhn.pharmacy.api.PharmacyViews.StockReturnLineView;
import com.rhn.pharmacy.api.PharmacyViews.StockReturnView;
import com.rhn.pharmacy.application.InventoryTraceApplicationService.TraceMovementLine;
import com.rhn.pharmacy.application.InventoryTraceApplicationService.TraceReturnLine;
import com.rhn.pharmacy.application.InventoryApplicationService.DocumentPostingCommand;
import com.rhn.pharmacy.application.InventoryApplicationService.DocumentPostingLineCommand;
import com.rhn.pharmacy.domain.DispenseTask;
import com.rhn.pharmacy.domain.DispenseTaskLine;
import com.rhn.pharmacy.domain.DispenseTaskStatus;
import com.rhn.pharmacy.domain.InventoryBalance;
import com.rhn.pharmacy.domain.InventoryReservation;
import com.rhn.pharmacy.domain.InventoryTraceCodeStatus;
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
import com.rhn.pharmacy.infrastructure.InventoryReservationRepository;
import com.rhn.pharmacy.infrastructure.InventoryTransactionLineRepository;
import com.rhn.pharmacy.infrastructure.MedicationDispenseLineRepository;
import com.rhn.pharmacy.infrastructure.MedicationDispenseConsumptionRepository;
import com.rhn.pharmacy.infrastructure.MedicationDispenseRepository;
import com.rhn.pharmacy.infrastructure.StockBinRepository;
import com.rhn.pharmacy.infrastructure.StockItemRepository;
import com.rhn.pharmacy.infrastructure.StockLotRepository;
import com.rhn.pharmacy.infrastructure.StockReturnLineRepository;
import com.rhn.pharmacy.infrastructure.StockReturnRepository;
import com.rhn.pharmacy.infrastructure.StockSiteRepository;
import com.rhn.platform.eventing.api.DomainEventPublisher;
import com.rhn.platform.organization.api.OrganizationDirectory;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.text.Strings;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class DispenseApplicationService {
    private final BusinessNumberGenerator numbers;
    private static final Comparator<DispenseAllocation> DISPENSE_LOCK_ORDER = Comparator
            .comparing((DispenseAllocation value) -> value.reservation().stockBinId())
            .thenComparing(value -> value.reservation().stockItemId())
            .thenComparing(value -> value.reservation().stockLotId());
    private static final Comparator<ReturnAllocation> RETURN_LOCK_ORDER = Comparator
            .comparing((ReturnAllocation value) -> value.originalLine().stockBinId())
            .thenComparing(value -> value.originalLine().stockItemId())
            .thenComparing(value -> value.originalLine().stockLotId())
            .thenComparing(ReturnAllocation::stockStatus);

    private final DispenseTaskRepository taskRepository;
    private final DispenseTaskLineRepository taskLineRepository;
    private final StockSiteRepository siteRepository;
    private final StockItemRepository itemRepository;
    private final StockBinRepository binRepository;
    private final StockLotRepository lotRepository;
    private final InventoryTransactionLineRepository transactionLineRepository;
    private final InventoryAvailabilityService availabilityService;
    private final InventoryLedgerPostingService inventoryLedger;
    private final InventoryReservationRepository reservationRepository;
    private final MedicationDispenseRepository dispenseRepository;
    private final MedicationDispenseLineRepository dispenseLineRepository;
    private final MedicationDispenseConsumptionRepository consumptionRepository;
    private final MedicationFulfillmentDirectory medicationFulfillment;
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
            InventoryTransactionLineRepository transactionLineRepository,
            InventoryAvailabilityService availabilityService, InventoryLedgerPostingService inventoryLedger,
            InventoryReservationRepository reservationRepository,
            MedicationDispenseRepository dispenseRepository,
            MedicationDispenseLineRepository dispenseLineRepository,
            MedicationDispenseConsumptionRepository consumptionRepository,
            MedicationFulfillmentDirectory medicationFulfillment,
            StockReturnRepository returnRepository, StockReturnLineRepository returnLineRepository,
            OrganizationDirectory organizationDirectory, InventoryTraceApplicationService traceService,
            InventoryQuantityPolicy quantityPolicy, InventorySplitApplicationService splitService,
            DomainEventPublisher eventPublisher,
            ExecutionContextProvider contextProvider, BusinessNumberGenerator numbers) {
        this.numbers = numbers;
        this.taskRepository = taskRepository; this.taskLineRepository = taskLineRepository;
        this.siteRepository = siteRepository; this.itemRepository = itemRepository;
        this.binRepository = binRepository; this.lotRepository = lotRepository;
        this.transactionLineRepository = transactionLineRepository; this.availabilityService = availabilityService;
        this.inventoryLedger = inventoryLedger;
        this.reservationRepository = reservationRepository; this.dispenseRepository = dispenseRepository;
        this.dispenseLineRepository = dispenseLineRepository;
        this.consumptionRepository = consumptionRepository;
        this.medicationFulfillment = medicationFulfillment;
        this.returnRepository = returnRepository;
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
        List<InventoryReservation> active = reservationRepository
                .lockActiveByDispenseTaskLine(context.tenantId(), line.id());
        if (active.isEmpty() || active.stream().anyMatch(value -> value.expiresAt() != null
                && !value.expiresAt().isAfter(Instant.now()))) {
            throw conflict("DISPENSE_PREPARATION_RESERVATION_INVALID", "配药复核前必须存在未过期的有效库存预留");
        }
        BigDecimal required = line.remainingQuantity().multiply(line.baseQuantityFactor());
        BigDecimal reserved = active.stream().map(InventoryReservation::releasableQuantity)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        if (reserved.compareTo(required) != 0) throw conflict(
                "DISPENSE_PREPARATION_RESERVATION_INCOMPLETE", "有效库存预留必须完整覆盖任务剩余计划量");
        String description = Strings.trimToNull(input.description());
        task.completePicking(input.pickerPractitionerId(), context.subjectId(), input.pickerAssignmentId(), description);
        line.completePicking(); taskRepository.flush(); taskLineRepository.flush();
        publish(context, site, task, "DISPENSE_PREPARATION_COMPLETED", Map.of(
                "requestId", line.requestId(), "pickerPractitionerId", input.pickerPractitionerId()));
        return new PreparationResultView(task.id(), task.taskNo(), task.status().name(), task.pickedAt(),
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

        DispenseTask task = lockTask(context, taskId);
        // A concurrent retry with the same request code may have committed while this call waited for the
        // task lock; re-check after locking so the duplicate is replayed instead of hitting the unique key.
        MedicationDispense replayed = dispenseRepository.findByTenantIdAndDispenseNo(
                context.tenantId(), requestCode).orElse(null);
        if (replayed != null) return verifyIdempotentDispense(replayed, taskId, input);
        StockSite site = requireSite(context, task.stockSiteId());
        Long deptId = StockSiteRequirements.requireDepartment(site);
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
        Instant occurredAt = (input.occurredAt() == null ? Instant.now() : input.occurredAt())
                .truncatedTo(java.time.temporal.ChronoUnit.MICROS);
        List<InventoryReservation> reservations = reservationRepository.lockActiveByDispenseTaskLine(
                context.tenantId(), taskLine.id());
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
        MedicationDispense event = dispenseRepository.save(new MedicationDispense(context.tenantId(),
                site.organizationId(), deptId, task.id(),
                task.residentId(), task.encounterId(), site.id(), null, requestCode, "DISPENSE", occurredAt,
                input.dispenserPractitionerId(), context.subjectId(), input.dispenserAssignmentId(),
                input.checkerPractitionerId(), input.checkerPractitionerId() == null ? null : context.subjectId(),
                input.checkerAssignmentId(), quantity, taskLine.dispenseUnitCode(), Strings.trimToNull(input.description())));

        BigDecimal remaining = baseRequired; List<DispenseAllocation> allocations = new ArrayList<>();
        List<InventoryReservation> orderedReservations = reservations.stream().sorted(Comparator
                .comparing(InventoryReservation::stockBinId)
                .thenComparing(InventoryReservation::stockItemId)
                .thenComparing(InventoryReservation::stockLotId)).toList();
        for (InventoryReservation reservation : orderedReservations) {
            if (remaining.signum() == 0) break;
            BigDecimal allocation = reservation.releasableQuantity().min(remaining);
            InventoryBalance balance = availabilityService.lockDimension(context.tenantId(), reservation.stockBinId(),
                    reservation.stockItemId(), reservation.stockLotId(), "AVAILABLE")
                    .orElseThrow(() -> conflict("INVENTORY_BALANCE_NOT_FOUND", "预留对应库存投影不存在"));
            if (taskLine.split()) {
                splitService.consumeForDispense(context, site, item, reservation.stockBinId(),
                        reservation.stockLotId(), allocation, event.id(), event.dispenseNo(), occurredAt);
            } else {
                splitService.ensureSealedAvailable(context.tenantId(), reservation.stockBinId(), item.id(),
                        reservation.stockLotId(), balance.quantityOnHand(), allocation);
            }
            BigDecimal operation = allocation.divide(taskLine.baseQuantityFactor());
            allocations.add(new DispenseAllocation(reservation, allocation, operation));
            remaining = remaining.subtract(allocation);
        }
        allocations.sort(DISPENSE_LOCK_ORDER);
        var transaction = inventoryLedger.postDocument(new DocumentPostingCommand(requestCode, "DISPENSE",
                "MEDICATION_DISPENSE", requestCode, site.id(), occurredAt, Strings.trimToNull(input.description()),
                allocations.stream().map(value -> new DocumentPostingLineCommand(
                        value.reservation().stockBinId(), value.reservation().stockItemId(),
                        value.reservation().stockLotId(), "AVAILABLE", value.baseQuantity().negate(), null, true))
                        .toList()));
        if (transaction.lines().size() != allocations.size()) throw conflict(
                "MEDICATION_DISPENSE_LEDGER_MISMATCH", "发药库存分录数量与预留分配不一致");
        List<MedicationDispenseLine> eventLines = new ArrayList<>();
        for (int index = 0; index < allocations.size(); index++) {
            DispenseAllocation allocation = allocations.get(index);
            InventoryTransactionLineView transactionLine = transaction.lines().get(index);
            allocation.reservation().consume(allocation.baseQuantity(), context.subjectId(), occurredAt);
            eventLines.add(dispenseLineRepository.save(new MedicationDispenseLine(context.tenantId(), event.id(),
                    taskLine.id(), null, index + 1, allocation.reservation().stockBinId(),
                    allocation.reservation().stockItemId(), allocation.reservation().stockLotId(), transactionLine.id(),
                    allocation.operationQuantity(), taskLine.dispenseUnitCode(), taskLine.baseQuantityFactor())));
        }
        if (!taskLine.split()) {
            traceService.issue(context, site.id(), "MEDICATION_DISPENSE", event.id(), event.dispenseNo(),
                    eventLines.stream().map(line -> new TraceMovementLine(line.stockBinId(), line.stockItemId(),
                            line.stockLotId(), line.quantityDispensed().multiply(line.baseQuantityFactor()))).toList(),
                    input.traceCodeIds());
        }
        taskLine.recordDispense(quantity); task.recordDispense(taskLine.remainingQuantity().signum() == 0);
        reservationRepository.flush();
        dispenseLineRepository.flush(); taskLineRepository.flush(); taskRepository.flush();
        publish(context, site, task, "MEDICATION_DISPENSE_POSTED", occurredAt, Map.of("dispenseId", event.id(),
                "dispenseNo", event.dispenseNo(), "requestId", taskLine.requestId(), "operationQuantity", quantity,
                "operationUnitCode", taskLine.dispenseUnitCode(), "inventoryTransactionId", transaction.id(),
                "taskType", task.taskType(), "dispensedBy", context.subjectId(),
                "partial", task.status() != DispenseTaskStatus.COMPLETED));
        return dispenseView(context, event, eventLines);
    }

    @Transactional
    public StockReturnView returnMedication(Long originalDispenseId, ReturnCommand input) {
        ExecutionContext context = requireWorkContext(); String returnNo = required(input.returnNo(),
                "STOCK_RETURN_NO_REQUIRED", "退药请求编码不能为空");
        StockReturn existing = returnRepository.findByTenantIdAndCommandCode(context.tenantId(), returnNo).orElse(null);
        if (existing != null) return verifyIdempotentReturn(context, existing, originalDispenseId, input);
        MedicationDispense original = dispenseRepository.lockByIdAndTenantId(originalDispenseId, context.tenantId())
                .orElseThrow(() -> notFound("MEDICATION_DISPENSE_NOT_FOUND", "未找到原发药事件"));
        existing = returnRepository.findByTenantIdAndCommandCode(context.tenantId(), returnNo).orElse(null);
        if (existing != null) return verifyIdempotentReturn(context, existing, originalDispenseId, input);

        if (!Set.of("DISPENSE", "REDISPENSE").contains(original.dispenseType())) {
            throw conflict("STOCK_RETURN_ORIGINAL_TYPE_INVALID", "退药只能关联实际发药或补发事件");
        }
        DispenseTask task = lockTask(context, original.taskId());
        // 已被“取消发药”整笔冲回的发药事件库存已回到药房，再对其退药会重复入库。
        if (cancelledDispenseIds(context, task.id()).contains(original.id())) {
            throw conflict("STOCK_RETURN_ORIGINAL_CANCELLED", "原发药记录已取消发药，请按重新发药记录办理退药");
        }
        if (!Set.of(DispenseTaskStatus.COMPLETED, DispenseTaskStatus.PARTIALLY_RETURNED,
                DispenseTaskStatus.CANCELLED).contains(task.status())) {
            throw conflict("STOCK_RETURN_TASK_NOT_COMPLETED", "当前发药任务尚未完成或未因停嘱冻结，不能退药");
        }
        StockSite site = requireSite(context, original.stockSiteId()); requireOrganizationAccess(context, site.organizationId());
        DispenseTaskLine taskLine = requireTaskLine(context, task.id());
        validatePractitioner(context, site, input.processorPractitionerId(), input.processorAssignmentId(), "退药确认");
        if (input.lines() == null || input.lines().isEmpty()) throw badRequest(
                "STOCK_RETURN_LINES_REQUIRED", "退药必须至少选择一条原发药批次明细");
        String reasonCode = required(input.reasonCode(), "STOCK_RETURN_REASON_REQUIRED", "退药必须填写原因编码");
        Instant occurredAt = (input.occurredAt() == null ? Instant.now() : input.occurredAt())
                .truncatedTo(java.time.temporal.ChronoUnit.MICROS);
        ReturnPreparation preparation = validateReturnLines(context, taskLine, original, input.lines());
        BigDecimal total = preparation.total(); Map<Long, MedicationDispenseLine> originals = preparation.originals();
        Long returnDeptId = site.departmentId() != null ? site.departmentId() : original.departmentId();
        String displayNumber = numbers.next("pharmacy-return",
                new BusinessNumberContext(context.tenantId(), site.organizationId(), returnDeptId));
        MedicationDispense returnEvent = dispenseRepository.save(new MedicationDispense(context.tenantId(),
                site.organizationId(), returnDeptId, task.id(),
                task.residentId(), task.encounterId(), site.id(), original.id(), displayNumber, "RETURN", occurredAt,
                input.processorPractitionerId(), context.subjectId(), input.processorAssignmentId(), null, null,
                null, total, original.operationUnitCode(), Strings.trimToNull(input.description())));
        StockReturn stockReturn = returnRepository.save(new StockReturn(context.tenantId(), site.organizationId(), site.id(), task.residentId(),
                original.id(), returnEvent.id(), displayNumber, reasonCode, occurredAt, context.subjectId(), Strings.trimToNull(input.description()), returnNo));
        List<ReturnAllocation> allocations = buildReturnAllocations(context, taskLine, original, stockReturn,
                displayNumber, occurredAt, input.lines(), originals);
        InventoryTransactionView transaction = postReturnDocument(returnNo, displayNumber, site, occurredAt, input.description(),
                allocations);
        ReturnPostings postings = persistReturnLines(context, taskLine, site, original, returnEvent, stockReturn,
                displayNumber, transaction, allocations);
        taskLine.recordReturn(postings.taskReturned());
        task.recordReturn(taskLine.netDispensedQuantity().signum() == 0);
        dispenseLineRepository.flush();
        returnLineRepository.flush(); taskLineRepository.flush(); taskRepository.flush();
        publish(context, site, task, "MEDICATION_RETURN_POSTED", occurredAt, Map.of(
                "returnId", stockReturn.id(), "returnDispenseId", returnEvent.id(),
                "returnNo", stockReturn.returnNo(), "originalDispenseId", original.id(),
                "requestId", taskLine.requestId(), "operationQuantity", total,
                "operationUnitCode", original.operationUnitCode(), "processedBy", context.subjectId(),
                "inventoryTransactionId", transaction.id()));
        return returnView(context, stockReturn, postings.returnLines());
    }

    @Transactional
    public List<DispenseCancelResultView> cancelDispenseBatch(List<Long> taskIds, CancelDispenseCommand template) {
        List<DispenseCancelResultView> results = new ArrayList<>(taskIds.size());
        for (Long taskId : taskIds) {
            // 复用全局雪花编号作为逐任务取消编码后缀，避免同发药单重试时冲正单据编码冲突。
            results.add(cancelDispense(taskId, new CancelDispenseCommand(
                    "CNC-" + taskId + "-" + com.rhn.shared.id.GlobalIds.next(),
                    template.operatorPractitionerId(), template.operatorAssignmentId(),
                    template.reasonCode(), template.description(), template.occurredAt())));
        }
        return results;
    }

    @Transactional
    public DispenseCancelResultView cancelDispense(Long taskId, CancelDispenseCommand input) {
        ExecutionContext context = requireWorkContext();
        String cancelNo = required(input.cancelNo(), "DISPENSE_CANCEL_NO_REQUIRED", "取消发药请求编码不能为空");
        DispenseTask task = lockTask(context, taskId);
        if (task.status() != DispenseTaskStatus.COMPLETED && task.status() != DispenseTaskStatus.PARTIALLY_DISPENSED) {
            throw conflict("DISPENSE_TASK_NOT_DISPENSED", "当前发药任务未发药，无法取消发药");
        }
        StockSite site = requireSite(context, task.stockSiteId());
        requireOrganizationAccess(context, site.organizationId());
        DispenseTaskLine taskLine = requireTaskLine(context, task.id());
        // A dispensed-and-administered medication cannot be pulled back to stock; the ward must return it instead.
        if (consumptionRepository.consumedBaseQuantityForTaskLine(context.tenantId(), taskLine.id()).signum() > 0) {
            throw conflict("DISPENSE_ALREADY_CONSUMED", "当前发药已被病区核销给药，不能取消发药；请办理退药");
        }
        validatePractitioner(context, site, input.operatorPractitionerId(), input.operatorAssignmentId(), "取消发药");

        if (taskLine.returnedQuantity().signum() > 0) {
            throw conflict("DISPENSE_ALREADY_RETURNED", "当前发药任务已存在退药记录，不能直接撤销发药");
        }

        Set<Long> cancelled = cancelledDispenseIds(context, task.id());
        List<MedicationDispense> dispenses = dispenseRepository
                .findByTenantIdAndTaskIdOrderByOccurredAtAscIdAsc(context.tenantId(), task.id()).stream()
                .filter(value -> "DISPENSE".equals(value.dispenseType()) || "REDISPENSE".equals(value.dispenseType()))
                .filter(value -> !cancelled.contains(value.id()))
                .toList();
        if (dispenses.isEmpty()) {
            throw notFound("MEDICATION_DISPENSE_NOT_FOUND", "未找到对应的发药事件");
        }
        // 预留消耗不区分发药事件，多次分批发药时无法只冲回其中一次；此类任务按退药办理。
        if (dispenses.size() > 1) {
            throw conflict("DISPENSE_CANCEL_MULTIPLE_EVENTS", "当前任务存在多次发药记录，不能整笔取消发药，请改为退药");
        }
        MedicationDispense original = dispenses.get(0);
        if (!returnRepository.findByTenantIdAndOriginalDispenseIdOrderByRequestedAt(context.tenantId(), original.id()).isEmpty()) {
            throw conflict("DISPENSE_ALREADY_RETURNED", "当前发药事件已存在退药记录，不能直接撤销发药");
        }

        List<MedicationDispenseLine> originalLines = dispenseLineRepository
                .findByTenantIdAndMedicationDispenseIdOrderBySortOrder(context.tenantId(), original.id());

        Instant occurredAt = (input.occurredAt() == null ? Instant.now() : input.occurredAt())
                .truncatedTo(java.time.temporal.ChronoUnit.MICROS);
        String description = Strings.trimToNull(input.description());

        // 1. Save cancel dispense event; split restoration below references its id.
        Long deptId = site.departmentId() != null ? site.departmentId() : original.departmentId();
        MedicationDispense cancelEvent = dispenseRepository.save(new MedicationDispense(
                context.tenantId(), site.organizationId(), deptId, task.id(),
                task.residentId(), task.encounterId(), site.id(), original.id(), cancelNo, "CANCEL", occurredAt,
                input.operatorPractitionerId(), context.subjectId(), input.operatorAssignmentId(),
                null, null, null, original.operationQuantity(), original.operationUnitCode(), description
        ));

        // 2. Restore opened packages for split lines, or trace codes for sealed packages.
        if (taskLine.split()) {
            for (MedicationDispenseLine line : originalLines) {
                splitService.returnFromDispense(context, requireItem(context, line.stockItemId()), line.stockBinId(),
                        line.stockLotId(), line.quantityDispensed().multiply(line.baseQuantityFactor()), original.id(),
                        cancelEvent.id(), cancelNo, occurredAt);
            }
        } else {
            List<TraceReturnLine> traceReturns = originalLines.stream()
                    .map(line -> new TraceReturnLine(line.stockItemId(), line.stockLotId(), line.stockBinId(),
                            line.quantityDispensed().multiply(line.baseQuantityFactor()), InventoryTraceCodeStatus.AVAILABLE))
                    .toList();
            traceService.returnMedication(context, site.id(), original.id(), cancelEvent.id(), cancelNo, traceReturns);
        }

        // 3. Post reverse inventory document at the original issue cost so the lot's average cost is preserved.
        var reverseTransaction = inventoryLedger.postDocument(new DocumentPostingCommand(
                cancelNo, "RETURN", "MEDICATION_DISPENSE_CANCEL", cancelNo, site.id(), occurredAt,
                description,
                originalLines.stream().map(line -> new DocumentPostingLineCommand(
                        line.stockBinId(), line.stockItemId(), line.stockLotId(), "AVAILABLE",
                        line.quantityDispensed().multiply(line.baseQuantityFactor()),
                        transactionLineRepository.findById(line.inventoryTransactionLineId())
                                .filter(value -> value.tenantId().equals(context.tenantId()))
                                .map(InventoryTransactionLine::unitCost).orElse(null), false
                )).toList()
        ));

        // 4. Unconsume reservations and reserve the returned stock again, keeping balance and reservation in step.
        List<InventoryReservation> reservations = reservationRepository.findByTenantIdAndDispenseTaskLineIdOrderByCreatedAt(
                context.tenantId(), taskLine.id()).stream()
                .filter(value -> value.quantityConsumed().signum() > 0)
                .sorted(Comparator.comparing(InventoryReservation::stockBinId)
                        .thenComparing(InventoryReservation::stockItemId)
                        .thenComparing(InventoryReservation::stockLotId)).toList();
        for (InventoryReservation res : reservations) {
            InventoryBalance balance = availabilityService.lockDimension(context.tenantId(), res.stockBinId(),
                    res.stockItemId(), res.stockLotId(), "AVAILABLE")
                    .orElseThrow(() -> conflict("INVENTORY_BALANCE_NOT_FOUND", "预留对应库存投影不存在"));
            balance.reserve(res.quantityConsumed());
            availabilityService.save(balance);
            res.unconsume();
        }

        // 5. Update task & task line
        taskLine.cancelDispense(original.operationQuantity());
        task.cancelDispense();

        reservationRepository.flush();
        dispenseLineRepository.flush();
        taskLineRepository.flush();
        taskRepository.flush();

        publish(context, site, task, "MEDICATION_DISPENSE_CANCELLED", occurredAt, Map.of(
                "cancelId", cancelEvent.id(), "cancelNo", cancelNo, "originalDispenseId", original.id(),
                "taskId", task.id(), "requestId", taskLine.requestId(), "cancelledBy", context.subjectId(),
                "inventoryTransactionId", reverseTransaction.id()
        ));

        return new DispenseCancelResultView(task.id(), task.taskNo(), task.status().name(), cancelEvent.id(), cancelNo);
    }

    private ReturnPreparation validateReturnLines(ExecutionContext context, DispenseTaskLine taskLine,
                                                  MedicationDispense original, List<ReturnLineCommand> commands) {
        Map<Long, MedicationDispenseLine> originals = new HashMap<>();
        for (MedicationDispenseLine line : dispenseLineRepository.findByTenantIdAndMedicationDispenseIdOrderBySortOrder(
                context.tenantId(), original.id())) originals.put(line.id(), line);
        BigDecimal total = BigDecimal.ZERO;
        java.util.HashSet<Long> requestedOriginalLines = new java.util.HashSet<>();
        for (ReturnLineCommand command : commands) {
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
            BigDecimal consumedBase = medicationFulfillment.consumedBaseQuantityForDispenseLine(
                    context.tenantId(), line.id());
            BigDecimal requestedReturnBase = quantity.multiply(line.baseQuantityFactor());
            BigDecimal unconsumedBase = line.quantityDispensed().subtract(already)
                    .multiply(line.baseQuantityFactor()).subtract(consumedBase);
            if (requestedReturnBase.compareTo(unconsumedBase) > 0) {
                throw conflict("STOCK_RETURN_EXCEEDS_UNCONSUMED",
                        "退药数量包含已执行给药的药品，已核销部分不能退回药房");
            }
            String disposition = upper(command.disposition());
            if (!PharmacySystemEnums.contains(PharmacySystemEnums.RETURN_DISPOSITION, disposition)) throw badRequest(
                    "STOCK_RETURN_DISPOSITION_INVALID", "患者退药处置仅支持重新入库、隔离或待销毁");
            if (taskLine.split() && taskLine.traceRequired() && !"RESTOCK".equals(disposition)) {
                throw conflict("TRACE_PARTIAL_RETURN_DISPOSITION_UNSUPPORTED",
                        "带追溯码的拆零退药当前仅支持可再销售入库；隔离或待销毁需先走异常追溯处置");
            }
            total = total.add(quantity);
        }
        return new ReturnPreparation(total, originals);
    }

    private List<ReturnAllocation> buildReturnAllocations(ExecutionContext context, DispenseTaskLine taskLine,
                                                          MedicationDispense original, StockReturn stockReturn,
                                                          String returnNo, Instant occurredAt,
                                                          List<ReturnLineCommand> commands,
                                                          Map<Long, MedicationDispenseLine> originals) {
        List<ReturnAllocation> allocations = new ArrayList<>();
        for (ReturnLineCommand command : commands) {
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
            if (taskLine.split() && "RESTOCK".equals(disposition)) {
                splitService.returnFromDispense(context, returnItem, originalLine.stockBinId(),
                        originalLine.stockLotId(), baseQuantity, original.id(), stockReturn.id(), returnNo, occurredAt);
            }
            allocations.add(new ReturnAllocation(command, originalLine, disposition, stockStatus, returnQuantity,
                    baseQuantity, originalTransactionLine.unitCost()));
        }
        allocations.sort(RETURN_LOCK_ORDER);
        return allocations;
    }

    private InventoryTransactionView postReturnDocument(String requestCode, String returnNo, StockSite site, Instant occurredAt,
                                                        String description, List<ReturnAllocation> allocations) {
        InventoryTransactionView transaction = inventoryLedger.postDocument(new DocumentPostingCommand(requestCode, "RETURN",
                "PATIENT_RETURN", returnNo, site.id(), occurredAt, Strings.trimToNull(description),
                allocations.stream().map(value -> new DocumentPostingLineCommand(value.originalLine().stockBinId(),
                        value.originalLine().stockItemId(), value.originalLine().stockLotId(), value.stockStatus(),
                        value.baseQuantity(), value.unitCost(), false)).toList()));
        if (transaction.lines().size() != allocations.size()) throw conflict(
                "STOCK_RETURN_LEDGER_MISMATCH", "退药库存分录数量与退药明细不一致");
        return transaction;
    }

    private ReturnPostings persistReturnLines(ExecutionContext context, DispenseTaskLine taskLine, StockSite site,
                                              MedicationDispense original, MedicationDispense returnEvent,
                                              StockReturn stockReturn, String returnNo,
                                              InventoryTransactionView transaction, List<ReturnAllocation> allocations) {
        List<MedicationDispenseLine> returnEventLines = new ArrayList<>();
        List<StockReturnLine> returnLines = new ArrayList<>(); List<TraceReturnLine> traceReturns = new ArrayList<>();
        BigDecimal taskReturned = BigDecimal.ZERO;
        for (int index = 0; index < allocations.size(); index++) {
            ReturnAllocation allocation = allocations.get(index);
            MedicationDispenseLine originalLine = allocation.originalLine();
            InventoryTransactionLineView transactionLine = transaction.lines().get(index);
            int order = index + 1;
            MedicationDispenseLine returnEventLine = dispenseLineRepository.save(new MedicationDispenseLine(
                    context.tenantId(), returnEvent.id(), originalLine.taskLineId(), originalLine.id(), order,
                    originalLine.stockBinId(), originalLine.stockItemId(), originalLine.stockLotId(), transactionLine.id(),
                    allocation.returnQuantity(), originalLine.dispenseUnitCode(), originalLine.baseQuantityFactor()));
            returnEventLines.add(returnEventLine);
            returnLines.add(returnLineRepository.save(new StockReturnLine(context.tenantId(), stockReturn.id(),
                    originalLine.id(), order, originalLine.stockBinId(), originalLine.stockItemId(),
                    originalLine.stockLotId(), transactionLine.id(), allocation.returnQuantity(),
                    originalLine.dispenseUnitCode(), originalLine.baseQuantityFactor(), allocation.disposition(),
                    Strings.trimToNull(allocation.command().exceptionDescription()))));
            InventoryTraceCodeStatus traceStatus = switch (allocation.disposition()) { case "RESTOCK" -> InventoryTraceCodeStatus.AVAILABLE;
                case "QUARANTINE" -> InventoryTraceCodeStatus.QUARANTINED; default -> InventoryTraceCodeStatus.DAMAGED; };
            if (!taskLine.split()) traceReturns.add(new TraceReturnLine(originalLine.stockItemId(), originalLine.stockLotId(),
                    originalLine.stockBinId(), allocation.baseQuantity(), traceStatus));
            taskReturned = taskReturned.add(allocation.returnQuantity());
        }
        if (!taskLine.split()) {
            traceService.returnMedication(context, site.id(), original.id(), returnEvent.id(), returnNo, traceReturns);
        }
        return new ReturnPostings(returnLines, taskReturned);
    }

    @Transactional(readOnly = true)
    public DispenseTraceView trace(Long taskId) {
        ExecutionContext context = requireWorkContext(); DispenseTask task = requireTask(context, taskId);
        StockSite site = requireSite(context, task.stockSiteId()); requireOrganizationAccess(context, site.organizationId());
        DispenseTaskLine line = requireTaskLine(context, task.id());
        List<MedicationDispense> events = dispenseRepository.findByTenantIdAndTaskIdOrderByOccurredAtAscIdAsc(
                context.tenantId(), task.id());
        return traceView(context, task, line, events, traceFacts(context, events));
    }

    /** 批量读取发药轨迹：退药勾选多项时一次取回全部任务的事件、退药与货位批次，避免逐项请求与逐项查询。 */
    @Transactional(readOnly = true)
    public List<DispenseTraceView> traces(List<Long> taskIds) {
        ExecutionContext context = requireWorkContext();
        if (taskIds == null) return List.of();
        List<Long> requested = taskIds.stream().filter(java.util.Objects::nonNull).distinct().toList();
        if (requested.isEmpty()) return List.of();
        List<DispenseTask> tasks = taskRepository.findByTenantIdAndIdIn(context.tenantId(), requested).stream()
                .sorted(Comparator.comparing(DispenseTask::id)).toList();
        if (tasks.isEmpty()) return List.of();
        Map<Long, StockSite> sites = new HashMap<>();
        for (StockSite site : siteRepository.findByTenantIdAndIdIn(context.tenantId(),
                tasks.stream().map(DispenseTask::stockSiteId).collect(java.util.stream.Collectors.toSet()))) {
            sites.put(site.id(), site);
        }
        for (DispenseTask task : tasks) requireAccessibleSite(context, sites.get(task.stockSiteId()));

        Map<Long, DispenseTaskLine> lineByTask = new HashMap<>();
        for (DispenseTaskLine line : taskLineRepository.findByTenantIdAndTaskIdIn(context.tenantId(), requested)) {
            lineByTask.putIfAbsent(line.taskId(), line);
        }
        List<MedicationDispense> events = dispenseRepository.findByTenantIdAndTaskIdInOrderByOccurredAtAscIdAsc(
                context.tenantId(), requested);
        Map<Long, List<MedicationDispense>> eventsByTask = new HashMap<>();
        for (MedicationDispense event : events) {
            eventsByTask.computeIfAbsent(event.taskId(), key -> new ArrayList<>()).add(event);
        }
        TraceFacts facts = traceFacts(context, events);
        List<DispenseTraceView> views = new ArrayList<>(tasks.size());
        for (DispenseTask task : tasks) {
            DispenseTaskLine line = lineByTask.get(task.id());
            if (line == null) throw notFound("DISPENSE_TASK_LINE_NOT_FOUND", "发药任务缺少药品明细");
            views.add(traceView(context, task, line, eventsByTask.getOrDefault(task.id(), List.of()), facts));
        }
        return views;
    }

    /** 一次装载发药明细、退药、退药明细与货位批次，供单条与批量轨迹装配复用。 */
    private TraceFacts traceFacts(ExecutionContext context, List<MedicationDispense> events) {
        Map<Long, List<MedicationDispenseLine>> linesByEvent = new HashMap<>();
        if (!events.isEmpty()) {
            for (MedicationDispenseLine line : dispenseLineRepository
                    .findByTenantIdAndMedicationDispenseIdInOrderBySortOrder(context.tenantId(),
                            events.stream().map(MedicationDispense::id).toList())) {
                linesByEvent.computeIfAbsent(line.medicationDispenseId(), key -> new ArrayList<>()).add(line);
            }
        }
        List<Long> dispenseIds = events.stream().filter(DispenseApplicationService::isDispenseEvent)
                .map(MedicationDispense::id).toList();
        Map<Long, List<StockReturn>> returnsByOriginal = new HashMap<>();
        if (!dispenseIds.isEmpty()) {
            for (StockReturn value : returnRepository.findByTenantIdAndOriginalDispenseIdInOrderByRequestedAt(
                    context.tenantId(), dispenseIds)) {
                returnsByOriginal.computeIfAbsent(value.originalDispenseId(), key -> new ArrayList<>()).add(value);
            }
        }
        List<Long> returnIds = returnsByOriginal.values().stream()
                .flatMap(List::stream).map(StockReturn::id).toList();
        Map<Long, List<StockReturnLine>> linesByReturn = new HashMap<>();
        if (!returnIds.isEmpty()) {
            for (StockReturnLine line : returnLineRepository.findByTenantIdAndStockReturnIdInOrderBySortOrder(
                    context.tenantId(), returnIds)) {
                linesByReturn.computeIfAbsent(line.stockReturnId(), key -> new ArrayList<>()).add(line);
            }
        }
        List<MedicationDispenseLine> allLines = linesByEvent.values().stream().flatMap(List::stream).toList();
        Map<Long, StockBin> bins = new HashMap<>();
        List<Long> binIds = allLines.stream().map(MedicationDispenseLine::stockBinId).distinct().toList();
        if (!binIds.isEmpty()) {
            for (StockBin bin : binRepository.findByTenantIdAndIdIn(context.tenantId(), binIds)) {
                bins.put(bin.id(), bin);
            }
        }
        Map<Long, StockLot> lots = new HashMap<>();
        List<Long> lotIds = allLines.stream().map(MedicationDispenseLine::stockLotId).distinct().toList();
        if (!lotIds.isEmpty()) {
            for (StockLot lot : lotRepository.findByTenantIdAndIdIn(context.tenantId(), lotIds)) {
                lots.put(lot.id(), lot);
            }
        }
        return new TraceFacts(linesByEvent, returnsByOriginal, linesByReturn, bins, lots);
    }

    private DispenseTraceView traceView(ExecutionContext context, DispenseTask task, DispenseTaskLine line,
                                        List<MedicationDispense> events, TraceFacts facts) {
        List<StockReturnView> returns = new ArrayList<>();
        for (MedicationDispense event : events) {
            if (!isDispenseEvent(event)) continue;
            for (StockReturn value : facts.returnsByOriginal().getOrDefault(event.id(), List.of())) {
                returns.add(returnView(context, value, facts.linesByReturn().getOrDefault(value.id(), List.of())));
            }
        }
        return new DispenseTraceView(task.id(), task.taskNo(), task.status().name(), line.plannedQuantity(),
                line.dispensedQuantity(), line.returnedQuantity(), line.netDispensedQuantity(),
                line.dispenseUnitCode(), events.stream().map(value -> dispenseView(value,
                        facts.linesByEvent().getOrDefault(value.id(), List.of()),
                        dispenseLine -> dispenseLineView(dispenseLine, facts.bins().get(dispenseLine.stockBinId()),
                                facts.lots().get(dispenseLine.stockLotId())))).toList(), returns);
    }

    private record TraceFacts(Map<Long, List<MedicationDispenseLine>> linesByEvent,
                              Map<Long, List<StockReturn>> returnsByOriginal,
                              Map<Long, List<StockReturnLine>> linesByReturn,
                              Map<Long, StockBin> bins, Map<Long, StockLot> lots) {
    }

    private static boolean isDispenseEvent(MedicationDispense event) {
        return "DISPENSE".equals(event.dispenseType()) || "REDISPENSE".equals(event.dispenseType());
    }

    private MedicationDispenseView verifyIdempotentDispense(MedicationDispense value, Long taskId, DispenseCommand input) {
        if (!"DISPENSE".equals(value.dispenseType()) || !value.taskId().equals(taskId)
                || value.operationQuantity().compareTo(input.operationQuantity()) != 0) {
            throw conflict("MEDICATION_DISPENSE_REQUEST_REUSED", "相同发药请求编码不能用于不同内容");
        }
        ExecutionContext context = requireWorkContext();
        if (input.traceCodeIds() != null && !input.traceCodeIds().isEmpty()) {
            List<Long> actualTraceCodeIds = traceService.issuedTraceCodeIds(context, value.id());
            if (!actualTraceCodeIds.equals(input.traceCodeIds().stream().sorted().toList())) {
                throw conflict("MEDICATION_DISPENSE_REQUEST_REUSED", "相同发药请求编码不能用于不同追溯码");
            }
        }
        DispenseTask task = requireTask(context, value.taskId());
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
        return dispenseView(value, lines, line -> dispenseLineView(context, line));
    }

    private MedicationDispenseView dispenseView(MedicationDispense value, List<MedicationDispenseLine> lines,
                                                 Function<MedicationDispenseLine, MedicationDispenseLineView> lineView) {
        return new MedicationDispenseView(value.id(), value.taskId(), value.residentId(), value.encounterId(),
                value.stockSiteId(), value.originalDispenseId(), value.dispenseNo(), value.dispenseType(),
                value.occurredAt(), value.dispenserPractitionerId(), value.dispenserUserId(),
                value.dispenserAssignmentId(), value.checkerPractitionerId(), value.checkerUserId(),
                value.checkerAssignmentId(), value.checkedAt(), value.operationQuantity(), value.operationUnitCode(),
                value.description(), lines.stream().map(lineView).toList());
    }

    private MedicationDispenseLineView dispenseLineView(ExecutionContext context, MedicationDispenseLine value) {
        return dispenseLineView(value, requireBin(context, value.stockBinId()), requireLot(context, value.stockLotId()));
    }

    private MedicationDispenseLineView dispenseLineView(MedicationDispenseLine value, StockBin bin, StockLot lot) {
        if (bin == null) throw notFound("STOCK_BIN_NOT_FOUND", "未找到库存货位");
        if (lot == null) throw notFound("STOCK_LOT_NOT_FOUND", "未找到库存批次");
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
                && "ACTIVE".equals(value.sdPersonnelStatus()) && !value.hireDate().isAfter(today)
                && (value.leaveDate() == null || !value.leaveDate().isBefore(today)));
        var assignment = staff.assignments().stream().filter(value -> value.id().equals(assignmentId)).findFirst()
                .orElseThrow(() -> badRequest("PHARMACY_ASSIGNMENT_INVALID", action + "任职不属于当前药师"));
        if (!"PHARMACY".equals(assignment.sdPositionType())) {
            throw conflict("PHARMACY_POSITION_TYPE_REQUIRED", action + "任职必须使用药学岗位");
        }
        boolean active = assignment.organizationId().equals(site.organizationId())
                && "ACTIVE".equals(assignment.sdPersonnelStatus()) && !assignment.validFrom().isAfter(today)
                && (assignment.validTo() == null || !assignment.validTo().isBefore(today));
        if (!employed || !active) throw conflict(
                "PHARMACY_PRACTITIONER_NOT_ACTIVE", action + "药师在当前机构没有有效任职");
        if (context.departmentId() != null && !context.departmentId().equals(assignment.departmentId())) {
            throw badRequest("PHARMACY_ASSIGNMENT_CONTEXT_MISMATCH", action + "任职必须与当前工作科室一致");
        }
    }

    private DispenseTask lockTask(ExecutionContext context, Long id) {
        return taskRepository.lockByIdAndTenantId(id, context.tenantId())
                .orElseThrow(() -> notFound("DISPENSE_TASK_NOT_FOUND", "未找到发药任务"));
    }
    private DispenseTask requireTask(ExecutionContext context, Long id) {
        return taskRepository.findByIdAndTenantId(id, context.tenantId())
                .orElseThrow(() -> notFound("DISPENSE_TASK_NOT_FOUND", "未找到发药任务"));
    }
    /** 已被取消发药冲回的原发药事件 id。 */
    private Set<Long> cancelledDispenseIds(ExecutionContext context, Long taskId) {
        return dispenseRepository.findByTenantIdAndTaskIdOrderByOccurredAtAscIdAsc(context.tenantId(), taskId).stream()
                .filter(value -> "CANCEL".equals(value.dispenseType()) && value.originalDispenseId() != null)
                .map(MedicationDispense::originalDispenseId).collect(java.util.stream.Collectors.toSet());
    }
    private DispenseTaskLine requireTaskLine(ExecutionContext context, Long taskId) {
        return taskLineRepository.findByTenantIdAndTaskId(context.tenantId(), taskId)
                .orElseThrow(() -> notFound("DISPENSE_TASK_LINE_NOT_FOUND", "发药任务缺少药品明细"));
    }
    private StockSite requireSite(ExecutionContext context, Long id) {
        return requireAccessibleSite(context, requireSiteRow(id, context));
    }
    private StockSite requireSiteRow(Long id, ExecutionContext context) {
        return siteRepository.findByIdAndTenantId(id, context.tenantId())
                .orElseThrow(() -> notFound("STOCK_SITE_NOT_FOUND", "未找到库存站点"));
    }
    private StockSite requireAccessibleSite(ExecutionContext context, StockSite site) {
        if (site == null) throw notFound("STOCK_SITE_NOT_FOUND", "未找到库存站点");
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
        publish(context, site, task, type, Instant.now(), details);
    }
    private void publish(ExecutionContext context, StockSite site, DispenseTask task,
                         String type, Instant occurredAt, Map<String, Object> details) {
        eventPublisher.publish(context.tenantId(), site.organizationId(), type, 1, "DispenseTask", task.id(),
                task.revision(), task.residentId(), occurredAt, details);
    }
    private BigDecimal positive(BigDecimal value, String code, String message) {
        if (value == null || value.signum() <= 0) throw badRequest(code, message); return value;
    }
    private String required(String value, String code, String message) {
        String result = Strings.trimToNull(value); if (result == null) throw badRequest(code, message); return result;
    }
    private String upper(String value) { String result = Strings.trimToNull(value); return result == null ? null : result.toUpperCase(); }

    public record CompletePickingCommand(Long pickerPractitionerId, Long pickerAssignmentId, String description) {}
    public record DispenseCommand(String requestCode, BigDecimal operationQuantity, Instant occurredAt,
                                  Long dispenserPractitionerId, Long dispenserAssignmentId,
                                  Long checkerPractitionerId, Long checkerAssignmentId, String description,
                                  List<Long> traceCodeIds) {
        public DispenseCommand(String requestCode, BigDecimal operationQuantity, Instant occurredAt,
                               Long dispenserPractitionerId, Long dispenserAssignmentId,
                               Long checkerPractitionerId, Long checkerAssignmentId, String description) {
            this(requestCode, operationQuantity, occurredAt, dispenserPractitionerId, dispenserAssignmentId,
                    checkerPractitionerId, checkerAssignmentId, description, List.of());
        }
    }
    public record ReturnLineCommand(Long originalDispenseLineId, BigDecimal quantity,
                                    String disposition, String exceptionDescription) {}
    public record ReturnCommand(String returnNo, String reasonCode, Instant occurredAt,
                                Long processorPractitionerId, Long processorAssignmentId,
                                String description, List<ReturnLineCommand> lines) {}
    public record CancelDispenseCommand(String cancelNo, Long operatorPractitionerId, Long operatorAssignmentId,
                                        String reasonCode, String description, Instant occurredAt) {}
    private record DispenseAllocation(InventoryReservation reservation, BigDecimal baseQuantity,
                                      BigDecimal operationQuantity) {}
    private record ReturnAllocation(ReturnLineCommand command, MedicationDispenseLine originalLine,
                                    String disposition, String stockStatus, BigDecimal returnQuantity,
                                    BigDecimal baseQuantity, BigDecimal unitCost) {}
    private record ReturnPreparation(BigDecimal total, Map<Long, MedicationDispenseLine> originals) {}
    private record ReturnPostings(List<StockReturnLine> returnLines, BigDecimal taskReturned) {}
}
