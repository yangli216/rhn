package com.rhn.pharmacy.application;

import com.rhn.pharmacy.api.PharmacyViews.DispenseTaskView;
import com.rhn.pharmacy.api.PharmacyViews.WardDeliveryView;
import com.rhn.pharmacy.api.WardMedicationSupplyCandidateDirectory;
import com.rhn.pharmacy.api.WardMedicationSupplyCandidateDirectory.SupplyCandidate;
import com.rhn.pharmacy.api.WardMedicationSupplyViews.SupplyBatchView;
import com.rhn.pharmacy.api.WardMedicationSupplyViews.SupplyLineView;
import com.rhn.pharmacy.api.WardMedicationSupplyViews.SupplyOccurrenceView;
import com.rhn.pharmacy.api.WardMedicationSupplyViews.SupplyFulfillmentView;
import com.rhn.pharmacy.api.WardMedicationSupplyViews.SupplySummaryView;
import com.rhn.pharmacy.api.WardDeliveryDirectory;
import com.rhn.pharmacy.domain.DispenseTaskLine;
import com.rhn.pharmacy.domain.InpatientMedicationSupplyBatch;
import com.rhn.pharmacy.domain.InpatientMedicationSupplyLine;
import com.rhn.pharmacy.domain.InpatientMedicationSupplyTask;
import com.rhn.pharmacy.domain.StockSite;
import com.rhn.pharmacy.infrastructure.DispenseTaskLineRepository;
import com.rhn.pharmacy.infrastructure.DispenseTaskRepository;
import com.rhn.pharmacy.infrastructure.InpatientMedicationSupplyBatchRepository;
import com.rhn.pharmacy.infrastructure.InpatientMedicationSupplyLineRepository;
import com.rhn.pharmacy.infrastructure.InpatientMedicationSupplyTaskRepository;
import com.rhn.pharmacy.infrastructure.MedicationDispenseRepository;
import com.rhn.pharmacy.infrastructure.StockSiteRepository;
import com.rhn.outpatient.api.MedicationRequestDirectory;
import com.rhn.platform.organization.api.OrganizationDirectory;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class WardMedicationSupplyApplicationService {
    private static final DateTimeFormatter BATCH_TIME = DateTimeFormatter.ofPattern("yyyyMMddHHmmss")
            .withZone(ZoneId.of("Asia/Shanghai"));

    private final InpatientMedicationSupplyBatchRepository batches;
    private final InpatientMedicationSupplyLineRepository lines;
    private final InpatientMedicationSupplyTaskRepository supplyTasks;
    private final DispenseTaskLineRepository dispenseLines;
    private final DispenseTaskRepository dispenseTasks;
    private final StockSiteRepository stockSites;
    private final MedicationDispenseRepository medicationDispenses;
    private final WardMedicationSupplyCandidateDirectory candidates;
    private final WardDeliveryDirectory wardDeliveries;
    private final MedicationRequestDirectory medicationRequests;
    private final OrganizationDirectory organizations;
    private final ExecutionContextProvider contextProvider;
    private final PharmacyApplicationService pharmacy;
    private final InventoryApplicationService inventory;
    private final DispenseApplicationService dispense;
    private final WardDeliveryApplicationService delivery;

    public WardMedicationSupplyApplicationService(
            InpatientMedicationSupplyBatchRepository batches,
            InpatientMedicationSupplyLineRepository lines,
            InpatientMedicationSupplyTaskRepository supplyTasks,
            DispenseTaskLineRepository dispenseLines,
            DispenseTaskRepository dispenseTasks,
            StockSiteRepository stockSites,
            MedicationDispenseRepository medicationDispenses,
            WardMedicationSupplyCandidateDirectory candidates,
            WardDeliveryDirectory wardDeliveries,
            MedicationRequestDirectory medicationRequests,
            OrganizationDirectory organizations,
            ExecutionContextProvider contextProvider,
            PharmacyApplicationService pharmacy,
            InventoryApplicationService inventory,
            DispenseApplicationService dispense,
            WardDeliveryApplicationService delivery) {
        this.batches = batches;
        this.lines = lines;
        this.supplyTasks = supplyTasks;
        this.dispenseLines = dispenseLines;
        this.dispenseTasks = dispenseTasks;
        this.stockSites = stockSites;
        this.medicationDispenses = medicationDispenses;
        this.candidates = candidates;
        this.wardDeliveries = wardDeliveries;
        this.medicationRequests = medicationRequests;
        this.organizations = organizations;
        this.contextProvider = contextProvider;
        this.pharmacy = pharmacy;
        this.inventory = inventory;
        this.dispense = dispense;
        this.delivery = delivery;
    }

    @Transactional
    public SupplyBatchView generate(GenerateCommand input) {
        ExecutionContext context = requireContext();
        StockSite site = requirePharmacySite(context, input.stockSiteId());
        GenerationOutcome outcome = generateAggregate(context.tenantId(), site,
                input.nursingUnitDepartmentId(), input.businessDate(), input.shiftCode(),
                input.commandCode(), context.subjectId(), "MANUAL", false,
                null, null, null);
        return view(context.tenantId(), outcome.batch());
    }

    /** System entry point used by the durable scheduler; it never impersonates a user. */
    @Transactional
    public AutomaticGenerationResult generateAutomatically(AutomaticGenerateCommand input) {
        Long tenantId = required(input.tenantId(),
                "INPATIENT_SUPPLY_TENANT_REQUIRED", "自动供药任务缺少租户");
        StockSite site = requireAutomaticPharmacySite(tenantId, input.organizationId(), input.stockSiteId(),
                input.businessDate());
        Long routeId = required(input.dispenseRouteId(),
                "INPATIENT_SUPPLY_ROUTE_REQUIRED", "自动供药任务缺少已解析的发药路由");
        Long routeRevision = required(input.dispenseRouteRevision(),
                "INPATIENT_SUPPLY_ROUTE_REQUIRED", "自动供药任务缺少发药路由版本");
        String routingDimension = requiredText(input.medicationTypeSnapshot(),
                "INPATIENT_SUPPLY_ROUTING_DIMENSION_REQUIRED", "自动供药任务缺少药品类型快照")
                .toUpperCase(Locale.ROOT);
        GenerationOutcome outcome = generateAggregate(tenantId, site,
                input.nursingUnitDepartmentId(), input.businessDate(), input.shiftCode(),
                input.commandCode(), null, "AUTO", true,
                routeId, routeRevision, routingDimension);
        return new AutomaticGenerationResult(outcome.batch() == null ? null : outcome.batch().id(),
                outcome.noDemand(), outcome.existing());
    }

    private GenerationOutcome generateAggregate(Long tenantId, StockSite site, Long nursingUnitDepartmentId,
                                                  LocalDate requestedBusinessDate, String requestedShiftCode,
                                                  String requestedCommandCode, Long actorId,
                                                  String triggerType, boolean skipEmpty,
                                                  Long dispenseRouteId, Long dispenseRouteRevision,
                                                  String routingDimension) {
        Long departmentId = required(nursingUnitDepartmentId,
                "INPATIENT_SUPPLY_DEPARTMENT_REQUIRED", "请选择供药病区");
        organizations.requireDepartment(tenantId, site.organizationId(), departmentId);
        LocalDate businessDate = required(requestedBusinessDate,
                "INPATIENT_SUPPLY_DATE_REQUIRED", "请选择供药日期");
        String shiftCode = normalizeShift(requestedShiftCode);
        String commandCode = requiredText(requestedCommandCode,
                "INPATIENT_SUPPLY_COMMAND_REQUIRED", "供药业务请求号不能为空");
        ZoneId zone = organizationZone(tenantId, site.organizationId());
        SupplyWindow window = window(businessDate, shiftCode, zone);
        String payloadHash = hash(site.id() + "|" + departmentId + "|" + businessDate + "|" + shiftCode
                + "|" + defaultText(routingDimension, "ALL"));

        InpatientMedicationSupplyBatch replay = batches
                .findByTenantIdAndGenerationCommandCode(tenantId, commandCode).orElse(null);
        if (replay != null) {
            if (!payloadHash.equals(replay.generationPayloadHash())) {
                throw conflict("INPATIENT_SUPPLY_COMMAND_REUSED", "同一供药业务请求号不能用于不同窗口");
            }
            return new GenerationOutcome(replay, false, true);
        }
        InpatientMedicationSupplyBatch existing = batches
                .findByTenantIdAndNursingUnitDepartmentIdAndWindowStartLessThanAndWindowEndGreaterThanOrderByWindowStart(
                        tenantId, departmentId, window.to(), window.from()).stream()
                .filter(value -> site.id().equals(value.stockSiteId())
                        && window.from().equals(value.windowStart()) && window.to().equals(value.windowEnd())
                        && Objects.equals(routingDimension, value.routingDimension())
                        && !"CANCELLED".equals(value.status()))
                .findFirst().orElse(null);
        if (existing != null) return new GenerationOutcome(existing, false, true);

        List<SupplyCandidate> eligible = routingDimension == null
                ? candidates.eligibleOccurrences(tenantId, site.organizationId(), departmentId,
                        window.from(), window.to())
                : candidates.eligibleOccurrences(tenantId, site.organizationId(), departmentId,
                        routingDimension, window.from(), window.to());
        if (skipEmpty && eligible.isEmpty()) return new GenerationOutcome(null, true, false);

        InpatientMedicationSupplyBatch batch = new InpatientMedicationSupplyBatch(
                tenantId, site.organizationId(), site.id(), departmentId,
                nextBatchNo(), "DAILY", "UNIT_DOSE", window.from(), window.to(), window.from(),
                commandCode, payloadHash, triggerType, actorId,
                dispenseRouteId, dispenseRouteRevision, routingDimension);
        // IDs are assigned by the application, so Spring Data persists a new aggregate through merge.
        // Continue the lifecycle on the managed instance returned by saveAndFlush; mutating the
        // original detached object would make SUBMITTED visible only in this response, not in storage.
        batch = batches.saveAndFlush(batch);
        Map<Long, List<SupplyCandidate>> byRequest = new LinkedHashMap<>();
        eligible.forEach(value -> byRequest.computeIfAbsent(value.requestId(), ignored -> new ArrayList<>()).add(value));
        List<InpatientMedicationSupplyLine> savedLines = new ArrayList<>();
        List<InpatientMedicationSupplyTask> savedTasks = new ArrayList<>();
        for (List<SupplyCandidate> group : byRequest.values()) {
            SupplyCandidate first = group.getFirst();
            ensureConsistent(group, first);
            BigDecimal quantity = group.stream().map(SupplyCandidate::requiredQuantity)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            BigDecimal baseQuantity = group.stream().map(SupplyCandidate::requiredBaseQuantity)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            InpatientMedicationSupplyLine line = new InpatientMedicationSupplyLine(batch,
                    first.requestId(), first.encounterId(), first.residentId(),
                    defaultText(first.bedNo(), "未分床"), first.residentName(),
                    first.medicationCode(), first.medicationName(), quantity, first.quantityUnit(),
                    baseQuantity, first.baseUnitCode(), group.size(), actorId);
            line.submit(0, actorId);
            savedLines.add(line);
            for (SupplyCandidate occurrence : group) {
                savedTasks.add(new InpatientMedicationSupplyTask(line, occurrence.orderTaskId(),
                        occurrence.scheduledAt(), occurrence.requiredQuantity(), occurrence.quantityUnit(),
                        occurrence.requiredBaseQuantity(), occurrence.baseUnitCode(), actorId));
            }
        }
        try {
            lines.saveAll(savedLines);
            supplyTasks.saveAll(savedTasks);
            batch.submit(batch.revision(), commandCode, payloadHash, actorId);
            lines.flush();
            supplyTasks.flush();
            batches.flush();
        } catch (DataIntegrityViolationException exception) {
            InpatientMedicationSupplyBatch concurrent = batches
                    .findByTenantIdAndGenerationCommandCode(tenantId, commandCode).orElse(null);
            if (concurrent != null) return new GenerationOutcome(concurrent, false, true);
            throw conflict("INPATIENT_SUPPLY_GENERATION_CONFLICT", "供药窗口已被其他用户生成，请刷新后重试");
        }
        return new GenerationOutcome(batch, false, false);
    }

    @Transactional(readOnly = true)
    public List<SupplyBatchView> list(Long stockSiteId, Long nursingUnitDepartmentId,
                                      LocalDate businessDate, String shiftCode) {
        ExecutionContext context = requireContext();
        StockSite site = requirePharmacySite(context, stockSiteId);
        Long departmentId = required(nursingUnitDepartmentId,
                "INPATIENT_SUPPLY_DEPARTMENT_REQUIRED", "请选择供药病区");
        LocalDate date = businessDate == null ? LocalDate.now(organizationZone(
                context.tenantId(), site.organizationId())) : businessDate;
        String shift = normalizeShift(shiftCode);
        SupplyWindow window = window(date, shift, organizationZone(context.tenantId(), site.organizationId()));
        return batches
                .findByTenantIdAndNursingUnitDepartmentIdAndWindowStartLessThanAndWindowEndGreaterThanOrderByWindowStart(
                        context.tenantId(), departmentId, window.to(), window.from()).stream()
                .filter(value -> site.id().equals(value.stockSiteId()))
                .map(value -> view(context.tenantId(), value)).toList();
    }

    @Transactional(readOnly = true)
    public SupplyBatchView get(Long batchId) {
        ExecutionContext context = requireContext();
        InpatientMedicationSupplyBatch batch = requireBatch(context, batchId);
        requirePharmacySite(context, batch.stockSiteId());
        return view(context.tenantId(), batch);
    }

    @Transactional
    public SupplyLineView intake(Long lineId, IntakeCommand input) {
        ExecutionContext context = requireContext();
        InpatientMedicationSupplyLine line = lines.findLocked(context.tenantId(), lineId)
                .orElseThrow(() -> notFound("INPATIENT_SUPPLY_LINE_NOT_FOUND", "供药明细不存在"));
        InpatientMedicationSupplyBatch batch = requireBatch(context, line.supplyBatchId());
        requirePharmacySite(context, batch.stockSiteId());
        requireIntakeBatch(batch);
        requireIntakeLine(context, line, input.stockItemId());
        intakeLine(context, line, input);
        lines.flush();
        return lineView(context.tenantId(), line);
    }

    @Transactional
    public SupplyBatchView intakeBatch(Long batchId, BatchIntakeCommand input) {
        ExecutionContext context = requireContext();
        InpatientMedicationSupplyBatch batch = batches.findLocked(context.tenantId(), batchId)
                .orElseThrow(() -> notFound("INPATIENT_SUPPLY_BATCH_NOT_FOUND", "供药批次不存在"));
        requirePharmacySite(context, batch.stockSiteId());
        requireIntakeBatch(batch);

        List<BatchIntakeLineCommand> requestedLines = input == null ? null : input.lines();
        if (requestedLines == null || requestedLines.isEmpty()) {
            throw badRequest("INPATIENT_SUPPLY_BATCH_INTAKE_LINES_REQUIRED", "请至少选择一条供药明细");
        }
        if (requestedLines.size() > 500) {
            throw badRequest("INPATIENT_SUPPLY_BATCH_INTAKE_LINES_EXCEEDED", "单次整批接方最多处理500条明细");
        }
        Set<Long> uniqueLineIds = new HashSet<>();
        for (BatchIntakeLineCommand requestedLine : requestedLines) {
            if (requestedLine == null || requestedLine.lineId() == null) {
                throw badRequest("INPATIENT_SUPPLY_LINE_REQUIRED", "供药明细不能为空");
            }
            if (!uniqueLineIds.add(requestedLine.lineId())) {
                throw badRequest("INPATIENT_SUPPLY_LINE_DUPLICATED", "同一供药明细不能重复提交");
            }
            required(requestedLine.stockItemId(),
                    "INPATIENT_SUPPLY_STOCK_ITEM_REQUIRED", "请选择药房经营药品");
        }

        List<InpatientMedicationSupplyLine> lockedLines = lines.findAllLocked(
                context.tenantId(), List.copyOf(uniqueLineIds));
        if (lockedLines.size() != uniqueLineIds.size()) {
            throw notFound("INPATIENT_SUPPLY_LINE_NOT_FOUND", "供药明细不存在");
        }
        Map<Long, InpatientMedicationSupplyLine> byId = new LinkedHashMap<>();
        lockedLines.forEach(line -> byId.put(line.id(), line));
        for (BatchIntakeLineCommand requestedLine : requestedLines) {
            InpatientMedicationSupplyLine line = byId.get(requestedLine.lineId());
            if (!batch.id().equals(line.supplyBatchId())) {
                throw badRequest("INPATIENT_SUPPLY_LINE_BATCH_MISMATCH", "供药明细不属于目标批次");
            }
            requireIntakeLine(context, line, requestedLine.stockItemId());
        }
        for (BatchIntakeLineCommand requestedLine : requestedLines) {
            intakeLine(context, byId.get(requestedLine.lineId()),
                    new IntakeCommand(requestedLine.stockItemId(), input.description()));
        }
        lines.flush();
        return view(context.tenantId(), batch);
    }

    /**
     * Applies the routine PASS decision and FEFO/FIFO inventory reservation to every intaken line atomically.
     * Advanced or already completed tasks are retained as-is, making safe client retries state-idempotent.
     */
    @Transactional
    public SupplyBatchView reviewAndReserveBatch(Long batchId, BatchReviewReserveCommand input) {
        ExecutionContext context = requireContext();
        InpatientMedicationSupplyBatch batch = batches.findLocked(context.tenantId(), batchId)
                .orElseThrow(() -> notFound("INPATIENT_SUPPLY_BATCH_NOT_FOUND", "供药批次不存在"));
        requirePharmacySite(context, batch.stockSiteId());
        if (!"SUBMITTED".equals(batch.status()) && !"CLOSED".equals(batch.status())) {
            throw conflict("INPATIENT_SUPPLY_BATCH_NOT_REVIEWABLE", "只有已提交供药批次可以批量审方预留");
        }
        if (input == null) {
            throw badRequest("INPATIENT_SUPPLY_BATCH_REVIEW_REQUIRED", "批量审方信息不能为空");
        }
        List<InpatientMedicationSupplyLine> currentLines = lines
                .findByTenantIdAndSupplyBatchIdOrderById(context.tenantId(), batch.id());
        List<Long> activeLineIds = currentLines.stream()
                .filter(line -> !"CANCELLED".equals(line.status()))
                .map(InpatientMedicationSupplyLine::id).toList();
        if (activeLineIds.isEmpty()) {
            throw conflict("INPATIENT_SUPPLY_BATCH_EMPTY", "当前供药批次没有可处理明细");
        }
        if (activeLineIds.size() > 500) {
            throw badRequest("INPATIENT_SUPPLY_BATCH_REVIEW_LINES_EXCEEDED", "单次批量审方预留最多处理500条明细");
        }
        List<InpatientMedicationSupplyLine> lockedLines = lines.findAllLocked(context.tenantId(), activeLineIds);
        if (lockedLines.size() != activeLineIds.size()) {
            throw conflict("INPATIENT_SUPPLY_BATCH_LINES_CHANGED", "供药批次明细已变化，请刷新后重试");
        }
        if (lockedLines.stream().anyMatch(line -> !"INTAKEN".equals(line.status()))) {
            throw conflict("INPATIENT_SUPPLY_BATCH_INTAKE_INCOMPLETE", "请先完成当前供药批次全部明细接方");
        }
        List<Long> taskIds = lockedLines.stream().map(line -> {
            DispenseTaskLine dispenseLine = dispenseLines.findById(line.dispenseTaskLineId())
                    .filter(value -> context.tenantId().equals(value.tenantId())
                            && "INPATIENT_SUPPLY_LINE".equals(value.fulfillmentSourceType())
                            && line.id().equals(value.fulfillmentSourceId()))
                    .orElseThrow(() -> conflict("INPATIENT_SUPPLY_INTAKE_LINK_MISSING", "供药接方关联已失效"));
            return dispenseLine.taskId();
        }).distinct().sorted().toList();
        if (taskIds.size() != lockedLines.size()) {
            throw conflict("INPATIENT_SUPPLY_TASK_LINK_DUPLICATED", "供药批次存在重复发药任务关联，请人工核查");
        }
        Integer expiryMinutes = input.expiryMinutes() == null ? 30 : input.expiryMinutes();
        for (Long taskId : taskIds) {
            DispenseTaskView task = pharmacy.task(taskId);
            if ("PENDING_REVIEW".equals(task.status())) {
                task = pharmacy.review(taskId, new PharmacyApplicationService.ReviewCommand(
                        "PASS", null, defaultText(input.description(), "住院供药批次常规审方通过"),
                        required(input.pharmacistPractitionerId(), "INPATIENT_SUPPLY_REVIEWER_REQUIRED", "请选择审方药师"),
                        required(input.reviewerAssignmentId(), "INPATIENT_SUPPLY_REVIEW_ASSIGNMENT_REQUIRED", "请选择审方岗位")));
            }
            if ("INTERVENTION".equals(task.status()) || "REJECTED".equals(task.status())) {
                throw conflict("INPATIENT_SUPPLY_BATCH_REVIEW_EXCEPTION", "批次包含需干预或已驳回医嘱，请逐行处理");
            }
            if ("READY_TO_PICK".equals(task.status()) || "PICKING".equals(task.status())) {
                inventory.reserveTask(taskId, new InventoryApplicationService.ReserveCommand(expiryMinutes));
            }
        }
        return view(context.tenantId(), batch);
    }

    /**
     * Confirms the physical picking step for every routine line in one transaction. The method is
     * state-idempotent: tasks already waiting to dispense or already completed are reused only when
     * the recorded picker payload matches the retry.
     */
    @Transactional
    public SupplyBatchView completePickingBatch(Long batchId, BatchPickingCommand input) {
        ExecutionContext context = requireContext();
        InpatientMedicationSupplyBatch batch = lockFulfillmentBatch(context, batchId);
        if (input == null) {
            throw badRequest("INPATIENT_SUPPLY_BATCH_PICKING_REQUIRED", "整批配药复核信息不能为空");
        }
        Long practitionerId = required(input.pickerPractitionerId(),
                "INPATIENT_SUPPLY_PICKER_REQUIRED", "请选择配药药师");
        Long assignmentId = required(input.pickerAssignmentId(),
                "INPATIENT_SUPPLY_PICKER_ASSIGNMENT_REQUIRED", "请选择配药岗位");
        String description = defaultText(input.description(), "住院滚动供药整批配药复核");
        List<Long> taskIds = fulfillmentTaskIds(context, batch);
        Map<Long, DispenseTaskView> taskViews = taskViews(taskIds);
        for (DispenseTaskView task : taskViews.values()) {
            if (!Set.of("PICKING", "READY_TO_DISPENSE", "COMPLETED").contains(task.status())) {
                throw conflict("INPATIENT_SUPPLY_BATCH_PICKING_EXCEPTION",
                        "批次包含未完成审方预留或需逐行处理的任务，不能整批确认配药");
            }
            if (!"PICKING".equals(task.status())
                    && (!practitionerId.equals(task.assignedPractitionerId())
                    || !assignmentId.equals(task.pickedAssignmentId())
                    || !description.equals(task.pickDescription()))) {
                throw conflict("INPATIENT_SUPPLY_BATCH_PICKING_REPLAY_MISMATCH",
                        "批次内已有任务的配药人员、岗位或说明与本次请求不一致，请转逐行流程核查");
            }
        }
        for (Long taskId : taskIds) {
            if ("PICKING".equals(taskViews.get(taskId).status())) {
                dispense.completePicking(taskId, new DispenseApplicationService.CompletePickingCommand(
                        practitionerId, assignmentId, description));
            }
        }
        return view(context.tenantId(), batch);
    }

    /**
     * Issues every fully prepared routine task and creates one or more pending-dispatch ward
     * delivery documents atomically. Existing dispense and delivery records are reused only on an
     * exact business-payload retry.
     */
    @Transactional
    public SupplyFulfillmentView dispenseAndCreateDeliveries(Long batchId, BatchDispenseDeliveryCommand input) {
        ExecutionContext context = requireContext();
        InpatientMedicationSupplyBatch batch = lockFulfillmentBatch(context, batchId);
        if (input == null) {
            throw badRequest("INPATIENT_SUPPLY_BATCH_DISPENSE_REQUIRED", "整批发药信息不能为空");
        }
        Long practitionerId = required(input.dispenserPractitionerId(),
                "INPATIENT_SUPPLY_DISPENSER_REQUIRED", "请选择发药药师");
        Long assignmentId = required(input.dispenserAssignmentId(),
                "INPATIENT_SUPPLY_DISPENSER_ASSIGNMENT_REQUIRED", "请选择发药岗位");
        String description = defaultText(input.description(), "住院滚动供药整批发药");
        List<Long> taskIds = fulfillmentTaskIds(context, batch);
        Map<Long, DispenseTaskView> taskViews = taskViews(taskIds);
        for (DispenseTaskView task : taskViews.values()) {
            if (!Set.of("READY_TO_DISPENSE", "COMPLETED").contains(task.status())) {
                throw conflict("INPATIENT_SUPPLY_BATCH_DISPENSE_EXCEPTION",
                        "请先完成整批配药复核；部分发药、停嘱或异常任务需逐行处理");
            }
            if ("COMPLETED".equals(task.status())) {
                verifyBatchDispenseReplay(context, batch, task, input, description);
            }
        }

        for (Long taskId : taskIds) {
            DispenseTaskView task = taskViews.get(taskId);
            if ("READY_TO_DISPENSE".equals(task.status())) {
                if (task.lines().size() != 1) {
                    throw conflict("INPATIENT_SUPPLY_TASK_LINES_INVALID", "住院滚动供药任务必须且只能包含一条药品明细");
                }
                dispense.dispense(taskId, new DispenseApplicationService.DispenseCommand(
                                dispenseNo(batch.id(), taskId), task.lines().getFirst().plannedQuantity(), null,
                                practitionerId, assignmentId,
                                input.checkerPractitionerId(), input.checkerAssignmentId(),
                                description));
            }
        }

        Set<Long> existingDeliveryIds = new HashSet<>();
        List<Long> pendingDispenseIds = new ArrayList<>();
        for (Long taskId : taskIds) {
            List<com.rhn.pharmacy.domain.MedicationDispense> taskDispenses = medicationDispenses
                    .findByTenantIdAndTaskIdOrderByOccurredAtAscIdAsc(context.tenantId(), taskId).stream()
                    .filter(value -> "DISPENSE".equals(value.dispenseType())
                            || "REDISPENSE".equals(value.dispenseType()))
                    .toList();
            if (taskDispenses.isEmpty()) {
                throw conflict("INPATIENT_SUPPLY_DISPENSE_EVENT_MISSING", "发药任务已完成但未找到有效发药记录");
            }
            for (var event : taskDispenses) {
                var gate = wardDeliveries.deliveryGate(context.tenantId(), event.id());
                if (!gate.deliveryRequired()) {
                    pendingDispenseIds.add(event.id());
                } else if (gate.deliveryId() != null && !"MISSING".equals(gate.status())) {
                    existingDeliveryIds.add(gate.deliveryId());
                } else {
                    throw conflict("INPATIENT_SUPPLY_DELIVERY_LINK_INVALID", "发药记录的病区配送关联已失效");
                }
            }
        }

        List<WardDeliveryView> deliveryViews = new ArrayList<>();
        existingDeliveryIds.stream().sorted().map(delivery::get).forEach(deliveryViews::add);
        List<Long> orderedPending = pendingDispenseIds.stream().distinct().sorted().toList();
        for (int offset = 0, part = 1; offset < orderedPending.size(); offset += 100, part++) {
            List<Long> dispenseIds = orderedPending.subList(offset, Math.min(offset + 100, orderedPending.size()));
            deliveryViews.add(delivery.create(new WardDeliveryApplicationService.CreateWardDeliveryCommand(
                    deliveryNo(batch.id(), part), dispenseIds,
                    defaultText(input.description(), "住院滚动供药配送交接"))));
        }
        if (deliveryViews.isEmpty()) {
            throw conflict("INPATIENT_SUPPLY_DELIVERY_EMPTY", "当前批次没有可建立配送交接的发药记录");
        }
        if (deliveryViews.stream().anyMatch(value -> !batch.stockSiteId().equals(value.stockSiteId())
                || !batch.organizationId().equals(value.organizationId())
                || !batch.nursingUnitDepartmentId().equals(value.nursingUnitDepartmentId()))) {
            throw conflict("INPATIENT_SUPPLY_DELIVERY_DESTINATION_CHANGED",
                    "患者当前病区已与供药批次不一致，请核对转科情况后逐行处理");
        }
        deliveryViews.sort(Comparator.comparing(WardDeliveryView::id));
        return new SupplyFulfillmentView(view(context.tenantId(), batch), deliveryViews);
    }

    private void verifyBatchDispenseReplay(ExecutionContext context, InpatientMedicationSupplyBatch batch,
                                           DispenseTaskView task, BatchDispenseDeliveryCommand input,
                                           String description) {
        var existing = medicationDispenses.findByTenantIdAndDispenseNo(
                        context.tenantId(), dispenseNo(batch.id(), task.id()))
                .orElseThrow(() -> conflict("INPATIENT_SUPPLY_BATCH_DISPENSE_REPLAY_MISMATCH",
                        "批次内已有任务通过其他流程完成发药，请转逐行流程核查"));
        BigDecimal plannedQuantity = task.lines().size() == 1
                ? task.lines().getFirst().plannedQuantity() : null;
        if (!"DISPENSE".equals(existing.dispenseType())
                || !task.id().equals(existing.taskId())
                || plannedQuantity == null
                || existing.operationQuantity().compareTo(plannedQuantity) != 0
                || !Objects.equals(existing.dispenserPractitionerId(), input.dispenserPractitionerId())
                || !Objects.equals(existing.dispenserAssignmentId(), input.dispenserAssignmentId())
                || !Objects.equals(existing.checkerPractitionerId(), input.checkerPractitionerId())
                || !Objects.equals(existing.checkerAssignmentId(), input.checkerAssignmentId())
                || !Objects.equals(existing.description(), description)) {
            throw conflict("INPATIENT_SUPPLY_BATCH_DISPENSE_REPLAY_MISMATCH",
                    "批次内已有发药记录与本次发药人员、复核人员、数量或说明不一致");
        }
    }

    private InpatientMedicationSupplyBatch lockFulfillmentBatch(ExecutionContext context, Long batchId) {
        InpatientMedicationSupplyBatch batch = batches.findLocked(context.tenantId(), batchId)
                .orElseThrow(() -> notFound("INPATIENT_SUPPLY_BATCH_NOT_FOUND", "供药批次不存在"));
        requirePharmacySite(context, batch.stockSiteId());
        if (!Set.of("SUBMITTED", "CLOSED").contains(batch.status())) {
            throw conflict("INPATIENT_SUPPLY_BATCH_NOT_FULFILLABLE", "当前供药批次不能继续配药发药");
        }
        return batch;
    }

    private List<Long> fulfillmentTaskIds(ExecutionContext context, InpatientMedicationSupplyBatch batch) {
        List<InpatientMedicationSupplyLine> currentLines = lines
                .findByTenantIdAndSupplyBatchIdOrderById(context.tenantId(), batch.id());
        List<Long> activeLineIds = currentLines.stream().filter(line -> !"CANCELLED".equals(line.status()))
                .map(InpatientMedicationSupplyLine::id).toList();
        if (activeLineIds.isEmpty()) {
            throw conflict("INPATIENT_SUPPLY_BATCH_EMPTY", "当前供药批次没有可处理明细");
        }
        if (activeLineIds.size() > 100) {
            throw badRequest("INPATIENT_SUPPLY_BATCH_FULFILLMENT_EXCEEDED", "单次整批配药发药最多处理100条明细，请按批次拆分处理");
        }
        List<InpatientMedicationSupplyLine> lockedLines = lines.findAllLocked(context.tenantId(), activeLineIds);
        if (lockedLines.size() != activeLineIds.size()) {
            throw conflict("INPATIENT_SUPPLY_BATCH_LINES_CHANGED", "供药批次明细已变化，请刷新后重试");
        }
        if (lockedLines.stream().anyMatch(line -> !"INTAKEN".equals(line.status()))) {
            throw conflict("INPATIENT_SUPPLY_BATCH_INTAKE_INCOMPLETE", "请先完成当前供药批次全部明细接方");
        }
        List<Long> taskIds = lockedLines.stream().map(line -> {
            DispenseTaskLine taskLine = dispenseLines.findById(line.dispenseTaskLineId())
                    .filter(value -> context.tenantId().equals(value.tenantId())
                            && "INPATIENT_SUPPLY_LINE".equals(value.fulfillmentSourceType())
                            && line.id().equals(value.fulfillmentSourceId()))
                    .orElseThrow(() -> conflict("INPATIENT_SUPPLY_INTAKE_LINK_MISSING", "供药接方关联已失效"));
            return taskLine.taskId();
        }).distinct().sorted().toList();
        if (taskIds.size() != lockedLines.size()) {
            throw conflict("INPATIENT_SUPPLY_TASK_LINK_DUPLICATED", "供药批次存在重复发药任务关联，请人工核查");
        }
        return taskIds;
    }

    private Map<Long, DispenseTaskView> taskViews(List<Long> taskIds) {
        Map<Long, DispenseTaskView> result = new LinkedHashMap<>();
        taskIds.forEach(taskId -> result.put(taskId, pharmacy.task(taskId)));
        return result;
    }

    private String dispenseNo(Long batchId, Long taskId) {
        return "IPMS-DSP-" + batchId + "-" + taskId;
    }

    private String deliveryNo(Long batchId, int part) {
        return "IPMS-WD-" + batchId + "-" + part;
    }

    private void requireIntakeBatch(InpatientMedicationSupplyBatch batch) {
        if (!"SUBMITTED".equals(batch.status())) {
            throw conflict("INPATIENT_SUPPLY_BATCH_NOT_SUBMITTED", "只有已提交供药批次可以接方");
        }
    }

    private void requireIntakeLine(ExecutionContext context, InpatientMedicationSupplyLine line,
                                   Long requestedStockItemId) {
        if (!"SUBMITTED".equals(line.status()) && !"INTAKEN".equals(line.status())) {
            throw conflict("INPATIENT_SUPPLY_LINE_NOT_INTAKABLE", "供药明细当前不能接方");
        }
        if ("INTAKEN".equals(line.status())) {
            DispenseTaskLine existing = line.dispenseTaskLineId() == null ? null
                    : dispenseLines.findById(line.dispenseTaskLineId())
                    .filter(value -> context.tenantId().equals(value.tenantId())).orElse(null);
            if (existing == null) {
                throw conflict("INPATIENT_SUPPLY_INTAKE_LINK_MISSING", "供药接方关联已失效");
            }
            if (!existing.stockItemId().equals(requestedStockItemId)) {
                throw conflict("INPATIENT_SUPPLY_INTAKE_REPLAY_MISMATCH", "供药明细已使用其他药品接方，不能变更后重放");
            }
            pharmacy.task(existing.taskId());
        }
    }

    private void intakeLine(ExecutionContext context, InpatientMedicationSupplyLine line, IntakeCommand input) {
        if ("INTAKEN".equals(line.status())) return;
        DispenseTaskView task = pharmacy.intakeSupplyLine(line.id(), line.requestId(),
                line.requestedQuantity(), line.quantityUnitCode(),
                line.requestedBaseQuantity(), line.baseUnitCode(),
                new PharmacyApplicationService.IntakeCommand(
                        required(input.stockItemId(), "INPATIENT_SUPPLY_STOCK_ITEM_REQUIRED", "请选择药房经营药品"),
                        input.description()));
        Long taskLineId = task.lines().getFirst().id();
        line.recordIntake(line.revision(), taskLineId, context.subjectId());
    }

    private SupplyBatchView view(Long tenantId, InpatientMedicationSupplyBatch batch) {
        ZoneId zone = organizationZone(tenantId, batch.organizationId());
        LocalDate businessDate = batch.windowStart().atZone(zone).toLocalDate();
        String shiftCode = shiftFor(batch.windowStart().atZone(zone).toLocalTime());
        List<SupplyLineView> lineViews = lines.findByTenantIdAndSupplyBatchIdOrderById(tenantId, batch.id()).stream()
                .map(value -> lineView(tenantId, value)).toList();
        int covered = countStatus(lineViews, "COVERED");
        int gap = countStatus(lineViews, "PENDING_INTAKE") + countStatus(lineViews, "GAP");
        int issued = countStatus(lineViews, "ISSUED");
        int pendingReturn = countStatus(lineViews, "RETURN_PENDING");
        int exceptions = countStatus(lineViews, "EXCEPTION");
        String displayStatus = batchStatus(batch, lineViews);
        var department = organizations.requireDepartment(tenantId, batch.organizationId(),
                batch.nursingUnitDepartmentId());
        return new SupplyBatchView(batch.id(), batch.revision(), batch.batchNo(), batch.organizationId(),
                batch.stockSiteId(), batch.nursingUnitDepartmentId(), department.name(),
                businessDate, shiftCode, zone.getId(), batch.windowStart(), batch.windowEnd(), batch.cutoffAt(),
                batch.batchType(), batch.supplyMode(), displayStatus,
                new SupplySummaryView(lineViews.size(), covered, gap, issued, pendingReturn, exceptions), lineViews,
                batch.createdAt(), batch.closedAt() != null ? batch.closedAt()
                        : batch.cancelledAt() != null ? batch.cancelledAt()
                        : batch.submittedAt() != null ? batch.submittedAt() : batch.createdAt());
    }

    private SupplyLineView lineView(Long tenantId, InpatientMedicationSupplyLine line) {
        List<SupplyOccurrenceView> occurrences = supplyTasks
                .findByTenantIdAndSupplyLineIdOrderByScheduledAt(tenantId, line.id()).stream()
                .map(value -> new SupplyOccurrenceView(value.id(), value.revision(), value.orderTaskId(),
                        value.scheduledAt(), value.requiredQuantity(), value.quantityUnitCode(),
                        value.requiredBaseQuantity(), value.baseUnitCode(), value.status()))
                .toList();
        DispenseTaskLine dispenseLine = line.dispenseTaskLineId() == null ? null
                : dispenseLines.findById(line.dispenseTaskLineId())
                .filter(value -> tenantId.equals(value.tenantId())).orElse(null);
        Long dispenseTaskId = dispenseLine == null ? null : dispenseLine.taskId();
        String dispenseTaskStatus = dispenseTaskId == null ? null : dispenseTasks
                .findByIdAndTenantId(dispenseTaskId, tenantId)
                .map(value -> value.status()).orElse(null);
        BigDecimal requested = dispenseLine == null ? line.requestedQuantity() : dispenseLine.plannedQuantity();
        BigDecimal issued = dispenseLine == null ? BigDecimal.ZERO : dispenseLine.netDispensedQuantity();
        String unit = dispenseLine == null ? line.quantityUnitCode() : dispenseLine.dispenseUnitCode();
        BigDecimal covered = BigDecimal.ZERO;
        if (dispenseTaskId != null) {
            for (var dispense : medicationDispenses
                    .findByTenantIdAndTaskIdOrderByOccurredAtAscIdAsc(tenantId, dispenseTaskId)) {
                if (!"DISPENSE".equals(dispense.dispenseType()) && !"REDISPENSE".equals(dispense.dispenseType())) {
                    continue;
                }
                var gate = wardDeliveries.deliveryGate(tenantId, dispense.id());
                if (gate.ready() && gate.receivedQuantity() != null
                        && unit.equalsIgnoreCase(gate.unitCode())) {
                    covered = covered.add(gate.receivedQuantity());
                }
            }
        }
        covered = covered.min(issued).max(BigDecimal.ZERO);
        String status = lineStatus(line, dispenseLine, requested, issued, covered);
        var request = medicationRequests.requireForRouting(tenantId, line.requestId());
        Instant scheduledAt = occurrences.isEmpty() ? null : occurrences.getFirst().scheduledAt();
        return new SupplyLineView(line.id(), line.revision(), line.supplyBatchId(), line.requestId(),
                line.encounterId(), line.residentId(), line.bedNoSnapshot(), line.residentNameSnapshot(),
                request.catalogItemId(), request.medicationId(), line.medicationCodeSnapshot(),
                line.medicationNameSnapshot(), scheduledAt, requested, covered, issued,
                BigDecimal.ZERO, unit, line.occurrenceCount(), status,
                dispenseLine == null ? null : dispenseLine.stockItemId(), line.dispenseTaskLineId(),
                dispenseTaskId, dispenseTaskStatus, null, occurrences);
    }

    private int countStatus(List<SupplyLineView> lines, String status) {
        return (int) lines.stream().filter(value -> status.equals(value.status())).count();
    }

    private String batchStatus(InpatientMedicationSupplyBatch batch, List<SupplyLineView> lineViews) {
        if ("CANCELLED".equals(batch.status())) return "CANCELLED";
        if (lineViews.stream().anyMatch(value -> "EXCEPTION".equals(value.status()))) return "EXCEPTION";
        if (lineViews.isEmpty() || lineViews.stream().allMatch(value -> "COVERED".equals(value.status())
                || "CANCELLED".equals(value.status()))) return "COMPLETED";
        if (lineViews.stream().allMatch(value -> "PENDING_INTAKE".equals(value.status()))) return "OPEN";
        return "IN_PROGRESS";
    }

    private String lineStatus(InpatientMedicationSupplyLine line, DispenseTaskLine dispenseLine,
                              BigDecimal requested, BigDecimal issued, BigDecimal covered) {
        if ("CANCELLED".equals(line.status())) return "CANCELLED";
        if (dispenseLine == null) return "PENDING_INTAKE";
        if ("CANCELLED".equals(dispenseLine.status()) || "REJECTED".equals(dispenseLine.status())) {
            return "EXCEPTION";
        }
        if (covered.compareTo(requested) >= 0) return "COVERED";
        if (issued.signum() > 0) return "ISSUED";
        return "PREPARING";
    }

    private void ensureConsistent(List<SupplyCandidate> group, SupplyCandidate first) {
        boolean inconsistent = group.stream().anyMatch(value ->
                !first.encounterId().equals(value.encounterId())
                        || !first.residentId().equals(value.residentId())
                        || !first.quantityUnit().equalsIgnoreCase(value.quantityUnit())
                        || !first.baseUnitCode().equalsIgnoreCase(value.baseUnitCode())
                        || first.requiredQuantity().compareTo(value.requiredQuantity()) != 0
                        || first.requiredBaseQuantity().compareTo(value.requiredBaseQuantity()) != 0);
        if (inconsistent) throw conflict("INPATIENT_SUPPLY_OCCURRENCE_INCONSISTENT",
                "同一医嘱在当前窗口存在不一致剂量，请先拆分或更正医嘱");
    }

    private StockSite requirePharmacySite(ExecutionContext context, Long siteId) {
        StockSite site = stockSites.findByIdAndTenantId(required(siteId,
                        "INPATIENT_SUPPLY_SITE_REQUIRED", "请选择住院药房"), context.tenantId())
                .orElseThrow(() -> notFound("STOCK_SITE_NOT_FOUND", "住院药房不存在"));
        if (!context.canAccessOrganization(site.organizationId())
                || site.departmentId() != null && !site.departmentId().equals(context.departmentId())) {
            throw badRequest("PHARMACY_SITE_CONTEXT_MISMATCH", "当前工作科室与住院药房不一致");
        }
        if (!"PHARMACY".equals(site.siteType())
                || !("INPATIENT".equals(site.serviceScope()) || "MIXED".equals(site.serviceScope()))) {
            throw conflict("INPATIENT_SUPPLY_SITE_INVALID", "所选站点不是可用的住院药房");
        }
        if (!site.effective(LocalDate.now(organizationZone(context.tenantId(), site.organizationId())))) {
            throw conflict("INPATIENT_SUPPLY_SITE_NOT_EFFECTIVE", "所选住院药房当前不可用");
        }
        return site;
    }

    private StockSite requireAutomaticPharmacySite(Long tenantId, Long organizationId, Long siteId,
                                                    LocalDate businessDate) {
        StockSite site = stockSites.findByIdAndTenantId(required(siteId,
                        "INPATIENT_SUPPLY_SITE_REQUIRED", "自动供药任务缺少住院药房"), tenantId)
                .orElseThrow(() -> notFound("STOCK_SITE_NOT_FOUND", "住院药房不存在"));
        if (organizationId == null || !organizationId.equals(site.organizationId())) {
            throw badRequest("INPATIENT_SUPPLY_ORGANIZATION_MISMATCH", "自动供药药房与机构不一致");
        }
        if (!"PHARMACY".equals(site.siteType())
                || !("INPATIENT".equals(site.serviceScope()) || "MIXED".equals(site.serviceScope()))) {
            throw conflict("INPATIENT_SUPPLY_SITE_INVALID", "所选站点不是可用的住院药房");
        }
        LocalDate date = businessDate == null
                ? LocalDate.now(organizationZone(tenantId, organizationId)) : businessDate;
        if (!site.effective(date)) {
            throw conflict("INPATIENT_SUPPLY_SITE_NOT_EFFECTIVE", "所选住院药房在供药日期不可用");
        }
        return site;
    }

    private InpatientMedicationSupplyBatch requireBatch(ExecutionContext context, Long batchId) {
        return batches.findById(batchId)
                .filter(value -> context.tenantId().equals(value.tenantId()))
                .orElseThrow(() -> notFound("INPATIENT_SUPPLY_BATCH_NOT_FOUND", "供药批次不存在"));
    }

    private ExecutionContext requireContext() {
        ExecutionContext context = contextProvider.requireCurrent();
        if (!context.hasWorkContext() || context.organizationId() == null || context.departmentId() == null) {
            throw badRequest("PHARMACY_WORK_CONTEXT_REQUIRED", "滚动供药操作必须选择药房工作科室");
        }
        return context;
    }

    private ZoneId organizationZone(Long tenantId, Long organizationId) {
        String code = organizations.requireOrganization(tenantId, organizationId).timezoneCode();
        return ZoneId.of(code == null || code.isBlank() ? "Asia/Shanghai" : code);
    }

    private SupplyWindow window(LocalDate date, String shiftCode, ZoneId zone) {
        LocalTime start = switch (shiftCode) {
            case "NIGHT" -> LocalTime.MIDNIGHT;
            case "DAY" -> LocalTime.of(8, 0);
            case "EVENING" -> LocalTime.of(16, 0);
            default -> throw new IllegalStateException("Unsupported shift");
        };
        Instant from = date.atTime(start).atZone(zone).toInstant();
        return new SupplyWindow(from, from.plusSeconds(8 * 60 * 60L));
    }

    private String shiftFor(LocalTime time) {
        if (time.isBefore(LocalTime.of(8, 0))) return "NIGHT";
        if (time.isBefore(LocalTime.of(16, 0))) return "DAY";
        return "EVENING";
    }

    private String normalizeShift(String value) {
        String normalized = value == null || value.isBlank() ? "DAY" : value.trim().toUpperCase(Locale.ROOT);
        if (!List.of("NIGHT", "DAY", "EVENING").contains(normalized)) {
            throw badRequest("INPATIENT_SUPPLY_SHIFT_INVALID", "供药班次仅支持夜班、白班和晚班");
        }
        return normalized;
    }

    private String nextBatchNo() {
        return "MS" + BATCH_TIME.format(Instant.now()) + com.rhn.shared.id.GlobalIds.randomSuffix(6);
    }

    private String hash(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private <T> T required(T value, String code, String message) {
        if (value == null) throw badRequest(code, message);
        return value;
    }

    private String requiredText(String value, String code, String message) {
        if (value == null || value.isBlank()) throw badRequest(code, message);
        return value.trim();
    }

    private String defaultText(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    public record GenerateCommand(Long stockSiteId, Long nursingUnitDepartmentId,
                                  LocalDate businessDate, String shiftCode, String commandCode) {
    }

    public record AutomaticGenerateCommand(Long tenantId, Long organizationId, Long stockSiteId,
                                           Long nursingUnitDepartmentId, String medicationTypeSnapshot,
                                           Long dispenseRouteId, Long dispenseRouteRevision,
                                           LocalDate businessDate, String shiftCode, String commandCode) {
    }

    public record AutomaticGenerationResult(Long batchId, boolean noDemand, boolean existing) {
    }

    public record IntakeCommand(Long stockItemId, String description) {
    }

    public record BatchIntakeCommand(List<BatchIntakeLineCommand> lines, String description) {
    }

    public record BatchIntakeLineCommand(Long lineId, Long stockItemId) {
    }

    public record BatchReviewReserveCommand(Long pharmacistPractitionerId, Long reviewerAssignmentId,
                                            Integer expiryMinutes, String description) {
    }

    public record BatchPickingCommand(Long pickerPractitionerId, Long pickerAssignmentId, String description) {
    }

    public record BatchDispenseDeliveryCommand(Long dispenserPractitionerId, Long dispenserAssignmentId,
                                               Long checkerPractitionerId, Long checkerAssignmentId,
                                               String description) {
    }

    private record SupplyWindow(Instant from, Instant to) {
    }

    private record GenerationOutcome(InpatientMedicationSupplyBatch batch, boolean noDemand, boolean existing) {
    }
}
