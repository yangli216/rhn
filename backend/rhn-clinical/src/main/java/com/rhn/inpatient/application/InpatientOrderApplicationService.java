package com.rhn.inpatient.application;

import com.rhn.healthcore.api.ResidentDirectory;
import com.rhn.healthcore.api.ResidentDirectory.ResidentSnapshot;
import com.rhn.healthcore.api.AllergyDirectory;
import com.rhn.healthcore.api.AllergyDirectory.AllergySnapshot;
import com.rhn.inpatient.api.InpatientOrderViews.BatchTaskExecutionView;
import com.rhn.inpatient.api.InpatientOrderViews.TaskFailureView;
import com.rhn.inpatient.api.InpatientOrderViews.DoctorWorklistView;
import com.rhn.inpatient.api.InpatientOrderViews.NurseWorklistView;
import com.rhn.inpatient.api.InpatientOrderViews.MedicationConsumptionView;
import com.rhn.inpatient.api.InpatientOrderViews.MedicationClosureView;
import com.rhn.inpatient.api.InpatientOrderViews.OrderView;
import com.rhn.inpatient.api.InpatientOrderViews.TaskView;
import com.rhn.inpatient.domain.CareEpisode;
import com.rhn.inpatient.domain.CareEpisodeStatus;
import com.rhn.inpatient.domain.InpatientCareRequest;
import com.rhn.inpatient.domain.InpatientEncounter;
import com.rhn.inpatient.domain.InpatientEncounterStatus;
import com.rhn.inpatient.domain.InpatientOrderEvent;
import com.rhn.inpatient.domain.InpatientOrderTask;
import com.rhn.inpatient.domain.InpatientOrderWorkflow;
import com.rhn.inpatient.infrastructure.CareEpisodeRepository;
import com.rhn.inpatient.infrastructure.InpatientCareRequestRepository;
import com.rhn.inpatient.infrastructure.InpatientCareRequestStore;
import com.rhn.inpatient.infrastructure.InpatientCareRequestStore.CreateFact;
import com.rhn.inpatient.infrastructure.InpatientCareRequestStore.RequestDetails;
import com.rhn.inpatient.infrastructure.InpatientCareRequestStore.ServiceDetails;
import com.rhn.inpatient.infrastructure.InpatientEncounterRepository;
import com.rhn.inpatient.infrastructure.InpatientOrderEventRepository;
import com.rhn.inpatient.infrastructure.InpatientOrderTaskRepository;
import com.rhn.inpatient.infrastructure.InpatientOrderWorkflowRepository;
import com.rhn.platform.identityaccess.api.WorkContextDirectory;
import com.rhn.platform.organization.api.OrganizationDirectory;
import com.rhn.pharmacy.api.MedicationFulfillmentDirectory;
import com.rhn.pharmacy.api.InpatientMedicationStopDirectory;
import com.rhn.pharmacy.api.MedicationFulfillmentDirectory.ConsumptionCommand;
import com.rhn.pharmacy.api.MedicationFulfillmentDirectory.FulfillmentSnapshot;
import com.rhn.pharmacy.api.WardDeliveryDirectory;
import com.rhn.platform.eventing.api.DomainEventPublisher;
import com.rhn.platform.masterdata.api.MedicationTerminologyDirectory;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.text.Strings;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.forbidden;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class InpatientOrderApplicationService {
    private static final Set<String> ORDER_CATEGORIES = Set.of("MEDICATION", "SERVICE", "NURSING");
    private static final Set<String> DURATION_TYPES = Set.of("LONG_TERM", "TEMPORARY");
    private static final Set<String> ORDER_STATUSES = Set.of("DRAFT", "SIGNED", "ACTIVE", "COMPLETED", "STOPPED");
    private static final Set<String> TASK_STATUSES = Set.of("PLANNED", "EXECUTED", "SKIPPED", "CANCELLED");

    private final ExecutionContextProvider contextProvider;
    private final OrganizationDirectory organizations;
    private final WorkContextDirectory workContexts;
    private final ResidentDirectory residents;
    private final AllergyDirectory allergies;
    private final MedicationTerminologyDirectory terminologyDirectory;
    private final CareEpisodeRepository episodes;
    private final InpatientEncounterRepository encounters;
    private final InpatientCareRequestRepository requests;
    private final InpatientOrderWorkflowRepository workflows;
    private final InpatientOrderTaskRepository tasks;
    private final InpatientOrderEventRepository events;
    private final InpatientCareRequestStore requestStore;
    private final MedicationFulfillmentDirectory medicationFulfillment;
    private final InpatientMedicationStopDirectory medicationStops;
    private final WardDeliveryDirectory wardDeliveries;
    private final InpatientOrderChargeService orderCharges;
    private final DomainEventPublisher domainEvents;
    private final org.springframework.transaction.support.TransactionTemplate taskTransactions;

    public InpatientOrderApplicationService(
            ExecutionContextProvider contextProvider,
            OrganizationDirectory organizations,
            WorkContextDirectory workContexts,
            ResidentDirectory residents,
            AllergyDirectory allergies,
            MedicationTerminologyDirectory terminologyDirectory,
            CareEpisodeRepository episodes,
            InpatientEncounterRepository encounters,
            InpatientCareRequestRepository requests,
            InpatientOrderWorkflowRepository workflows,
            InpatientOrderTaskRepository tasks,
            InpatientOrderEventRepository events,
            InpatientCareRequestStore requestStore,
            MedicationFulfillmentDirectory medicationFulfillment,
            InpatientMedicationStopDirectory medicationStops,
            WardDeliveryDirectory wardDeliveries,
            InpatientOrderChargeService orderCharges,
            DomainEventPublisher domainEvents,
            org.springframework.transaction.PlatformTransactionManager transactionManager) {
        this.contextProvider = contextProvider;
        this.organizations = organizations;
        this.workContexts = workContexts;
        this.residents = residents;
        this.allergies = allergies;
        this.terminologyDirectory = terminologyDirectory;
        this.episodes = episodes;
        this.encounters = encounters;
        this.requests = requests;
        this.workflows = workflows;
        this.tasks = tasks;
        this.events = events;
        this.requestStore = requestStore;
        this.medicationFulfillment = medicationFulfillment;
        this.medicationStops = medicationStops;
        this.wardDeliveries = wardDeliveries;
        this.orderCharges = orderCharges;
        this.domainEvents = domainEvents;
        this.taskTransactions = new org.springframework.transaction.support.TransactionTemplate(transactionManager);
    }

    @Transactional
    public OrderView createDraft(CreateOrderCommand input) {
        ExecutionContext context = requireAction();
        String commandCode = requireCommand(input.commandCode());
        OrderView replay = replayOrder(context, commandCode);
        if (replay != null) return replay;
        String category = requiredEnum(input.orderCategory(), ORDER_CATEGORIES,
                "INPATIENT_ORDER_CATEGORY_INVALID", "住院医嘱类型不合法");
        String durationType = requiredEnum(input.durationType(), DURATION_TYPES,
                "INPATIENT_ORDER_DURATION_INVALID", "住院医嘱时效类型不合法");
        if (input.dosageAmount() != null && input.dosageAmount().signum() <= 0) {
            throw badRequest("INPATIENT_ORDER_DOSAGE_INVALID", "医嘱剂量必须大于0");
        }
        CareEpisode episode = requireAdmittedEpisode(context, input.episodeId());
        InpatientEncounter encounter = requireActiveEncounter(context, episode.id());
        requireDepartmentScope(context, encounter.departmentId());
        Long actorId = requireActor(context);
        Long requestId = requestStore.create(new CreateFact(context.tenantId(), episode.id(), encounter.id(),
                episode.residentId(), episode.organizationId(), encounter.departmentId(), category,
                input.catalogItemId(), input.itemCode(), input.itemName(), input.dosageAmount(),
                Strings.trimToNull(input.dosageUnit()), normalizeOptional(input.routeCode()), normalizeOptional(input.frequencyCode()),
                Strings.trimToNull(input.instructions()), actorId));
        InpatientCareRequest request = requireRequest(context, requestId);
        RequestDetails details = requestStore.details(context.tenantId(), requestId, category);
        InpatientOrderWorkflow workflow = workflows.saveAndFlush(new InpatientOrderWorkflow(
                requestId, context.tenantId(), episode.id(), durationType, context.practitionerId(),
                details.quantity(), details.quantityUnit(), details.baseQuantity(), details.baseUnit(), actorId));
        events.save(event(context, workflow, null, "ORDER_CREATED", null, "DRAFT", null, null,
                commandCode, null));
        return orderView(context, workflow, request);
    }

    @Transactional
    public OrderView sign(Long requestId, SignOrderCommand input) {
        ExecutionContext context = requireAction();
        String commandCode = requireCommand(input.commandCode());
        OrderView replay = replayOrder(context, commandCode);
        if (replay != null) return replay;
        InpatientOrderWorkflow workflow = requireLockedWorkflow(context, requestId);
        InpatientCareRequest request = requireLockedRequest(context, requestId);
        AllergyReview allergyReview = requireMedicationAllergyReview(request, input);
        String before = workflow.workflowStatus();
        workflow.sign(input.expectedRevision(), requireActor(context));
        events.save(event(context, workflow, null, "ORDER_SIGNED", before, workflow.workflowStatus(), null, null,
                commandCode, allergyReview == null ? null : allergyReview.eventReason()));
        workflows.flush();
        return orderView(context, workflow, request);
    }

    @Transactional
    public OrderView verify(Long requestId, OrderCommand input) {
        ExecutionContext context = requireAction();
        String commandCode = requireCommand(input.commandCode());
        OrderView replay = replayOrder(context, commandCode);
        if (replay != null) return replay;
        InpatientOrderWorkflow workflow = requireLockedWorkflow(context, requestId);
        InpatientCareRequest request = requireLockedRequest(context, requestId);
        String before = workflow.workflowStatus();
        workflow.verify(input.expectedRevision(), requireActor(context));
        request.activate();
        events.save(event(context, workflow, null, "ORDER_VERIFIED", before, workflow.workflowStatus(), null, null,
                commandCode, null));
        workflows.flush();
        requests.flush();
        publishServiceEvent(request, "INPATIENT_SERVICE_REQUEST_ACTIVATED", "住院诊疗医嘱已激活");
        return orderView(context, workflow, request);
    }

    @Transactional
    public OrderView plan(Long requestId, PlanCommand input) {
        ExecutionContext context = requireAction();
        String commandCode = requireCommand(input.commandCode());
        OrderView replay = replayOrder(context, commandCode);
        if (replay != null) return replay;
        List<Instant> plannedTimes = requirePlannedTimes(input.plannedTimes());
        InpatientOrderWorkflow workflow = requireLockedWorkflow(context, requestId);
        InpatientCareRequest request = requireLockedRequest(context, requestId);
        workflow.recordPlan(input.expectedRevision(), requireActor(context));
        List<InpatientOrderTask> existing = tasks.findLockedByRequest(context.tenantId(), requestId);
        for (Instant plannedAt : plannedTimes) {
            if (tasks.existsByTenantIdAndRequestIdAndScheduledAt(context.tenantId(), requestId, plannedAt)) {
                throw conflict("INPATIENT_TASK_TIME_DUPLICATE", "该医嘱已存在相同时间的执行计划");
            }
        }
        int occurrence = existing.stream().mapToInt(InpatientOrderTask::occurrenceNo).max().orElse(0);
        for (Instant plannedAt : plannedTimes) {
            tasks.save(new InpatientOrderTask(workflow, ++occurrence, plannedAt, requireActor(context)));
        }
        events.save(event(context, workflow, null, "TASKS_PLANNED", workflow.workflowStatus(),
                workflow.workflowStatus(), null, "PLANNED", commandCode,
                "生成执行任务 " + plannedTimes.size() + " 项"));
        tasks.flush();
        workflows.flush();
        return orderView(context, workflow, request);
    }

    @Transactional
    public TaskView execute(Long taskId, TaskCommand input) {
        return completeTask(taskId, input, false);
    }

    /** 批量执行医嘱任务：逐任务独立事务，单项失败不影响其余任务，保持局部成功语义。 */
    public BatchTaskExecutionView executeBatch(BatchTaskCommand input) {
        requireAction();
        String batchCommandCode = requireCommand(input.batchCommandCode());
        List<Long> succeeded = new ArrayList<>();
        List<TaskFailureView> failures = new ArrayList<>();
        for (BatchTaskItem item : input.items()) {
            String commandCode = batchCommandCode + "-" + item.taskId();
            try {
                taskTransactions.executeWithoutResult(status -> completeTask(item.taskId(),
                        new TaskCommand(item.expectedRevision(), input.outcomeCode(), input.note(), commandCode), false));
                succeeded.add(item.taskId());
            } catch (BusinessException exception) {
                failures.add(new TaskFailureView(item.taskId(), exception.code(), exception.getMessage()));
            }
        }
        return new BatchTaskExecutionView(succeeded, failures);
    }

    @Transactional
    public TaskView skip(Long taskId, TaskCommand input) {
        return completeTask(taskId, input, true);
    }

    @Transactional
    public OrderView stop(Long requestId, StopCommand input) {
        ExecutionContext context = requireAction();
        String commandCode = requireCommand(input.commandCode());
        OrderView replay = replayOrder(context, commandCode);
        if (replay != null) return replay;
        String reason = requiredText(input.reason(), "INPATIENT_STOP_REASON_REQUIRED", "停嘱原因不能为空");
        // Execution locks task -> workflow -> request -> pharmacy. Stop follows the same order.
        List<InpatientOrderTask> orderTasks = tasks.findLockedByRequest(context.tenantId(), requestId);
        InpatientOrderWorkflow workflow = requireLockedWorkflow(context, requestId);
        InpatientCareRequest request = requireLockedRequest(context, requestId);
        String before = workflow.workflowStatus();
        workflow.stop(input.expectedRevision(), requireActor(context), reason);
        request.cancel(requireActor(context), reason);
        int cancelled = 0;
        for (InpatientOrderTask task : orderTasks) {
            if (task.cancelIfFuture(workflow.stoppedAt(), requireActor(context), reason)) cancelled++;
        }
        if ("MEDICATION".equals(request.orderCategory())) {
            medicationStops.freezeAfterOrderStop(new InpatientMedicationStopDirectory.StopCommand(
                    context.tenantId(), request.id(), requireActor(context), reason));
        }
        events.save(event(context, workflow, null, "ORDER_STOPPED", before, workflow.workflowStatus(),
                "PLANNED", "CANCELLED", commandCode, reason + "；取消未来任务 " + cancelled + " 项"));
        tasks.flush();
        workflows.flush();
        requests.flush();
        publishServiceEvent(request, "INPATIENT_SERVICE_REQUEST_CANCELLED", "住院诊疗医嘱已停止");
        return orderView(context, workflow, request);
    }

    @Transactional(readOnly = true)
    public DoctorWorklistView doctorWorklist(Long episodeId, String status) {
        ExecutionContext context = requireContext();
        Long targetDepartmentId = targetDepartment(context, episodeId);
        Set<String> statuses = statusFilter(status, ORDER_STATUSES, Set.of("DRAFT", "SIGNED", "ACTIVE"),
                "INPATIENT_ORDER_STATUS_INVALID", "住院医嘱状态不合法");
        List<InpatientOrderWorkflow> candidates = workflows.findByTenantIdOrderByUpdatedAtDesc(context.tenantId())
                .stream()
                .filter(value -> episodeId == null || episodeId.equals(value.episodeId()))
                .filter(value -> statuses.contains(value.workflowStatus()))
                .toList();
        if (candidates.isEmpty()) return new DoctorWorklistView(List.of());
        // 批量装载医嘱事实、住院接触、居民快照、住院记录、任务与药品明细，避免逐医嘱重复查询。
        Set<Long> requestIds = candidates.stream().map(InpatientOrderWorkflow::requestId)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        Map<Long, InpatientCareRequest> requestById = new LinkedHashMap<>();
        requests.findByTenantIdAndIdIn(context.tenantId(), requestIds)
                .forEach(value -> requestById.putIfAbsent(value.id(), value));
        Set<Long> encounterIds = requestById.values().stream().map(InpatientCareRequest::encounterId)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        Map<Long, InpatientEncounter> encounterById = new LinkedHashMap<>();
        if (!encounterIds.isEmpty()) {
            encounters.findByTenantIdAndIdIn(context.tenantId(), encounterIds)
                    .forEach(value -> encounterById.putIfAbsent(value.id(), value));
        }
        Set<Long> authorizedDepartments = new LinkedHashSet<>();
        List<WorkflowAndRequest> visible = new ArrayList<>();
        for (InpatientOrderWorkflow workflow : candidates) {
            InpatientCareRequest request = requestById.get(workflow.requestId());
            if (request == null) throw notFound("INPATIENT_ORDER_NOT_FOUND", "住院医嘱事实不存在");
            InpatientEncounter encounter = requireRequestScope(context, request, encounterById, authorizedDepartments);
            if (!targetDepartmentId.equals(encounter.departmentId())) continue;
            visible.add(new WorkflowAndRequest(workflow, request));
        }
        if (visible.isEmpty()) return new DoctorWorklistView(List.of());
        Map<Long, ResidentSnapshot> snapshots = residents.requireSnapshots(context.tenantId(),
                visible.stream().map(value -> value.request().residentId())
                        .collect(Collectors.toCollection(LinkedHashSet::new)));
        Map<Long, CareEpisode> episodeById = new LinkedHashMap<>();
        episodes.findByTenantIdAndIdIn(context.tenantId(), visible.stream()
                        .map(value -> value.workflow().episodeId())
                        .collect(Collectors.toCollection(LinkedHashSet::new)))
                .forEach(value -> episodeById.putIfAbsent(value.id(), value));
        Map<Long, List<InpatientOrderTask>> tasksByRequest = new LinkedHashMap<>();
        tasks.findByTenantIdAndRequestIdInOrderByOccurrenceNoAsc(context.tenantId(),
                        visible.stream().map(value -> value.request().id())
                                .collect(Collectors.toCollection(LinkedHashSet::new)))
                .forEach(value -> tasksByRequest.computeIfAbsent(value.requestId(), ignored -> new ArrayList<>())
                        .add(value));
        TaskAssembly assembly = taskAssembly(context, visible.stream()
                .flatMap(value -> tasksByRequest.getOrDefault(value.request().id(), List.of()).stream()
                        .map(task -> new TaskContext(task, value.workflow(), value.request())))
                .toList());
        List<OrderView> values = visible.stream()
                .map(value -> orderView(value.workflow(), value.request(),
                        snapshots.get(value.request().residentId()), episodeById.get(value.workflow().episodeId()),
                        tasksByRequest.getOrDefault(value.request().id(), List.of()), assembly))
                .toList();
        return new DoctorWorklistView(values);
    }

    @Transactional(readOnly = true)
    public NurseWorklistView nurseWorklist(Long episodeId, String status, Instant from, Instant to) {
        ExecutionContext context = requireContext();
        Long targetDepartmentId = targetDepartment(context, episodeId);
        Set<String> statuses = statusFilter(status, TASK_STATUSES, Set.of("PLANNED"),
                "INPATIENT_TASK_STATUS_INVALID", "执行任务状态不合法");
        if (from != null && to != null && to.isBefore(from)) {
            throw badRequest("INPATIENT_TASK_TIME_RANGE_INVALID", "任务查询结束时间不能早于开始时间");
        }
        List<InpatientOrderTask> candidates = tasks.findByTenantIdOrderByScheduledAtAsc(context.tenantId()).stream()
                .filter(value -> statuses.contains(value.status().name()))
                .filter(value -> from == null || !value.scheduledAt().isBefore(from))
                .filter(value -> to == null || !value.scheduledAt().isAfter(to))
                .toList();
        if (candidates.isEmpty()) return new NurseWorklistView(List.of());
        // 批量装配工作流、诊疗事实、住院接触与居民快照，避免逐任务重复查询；科室授权按科室去重校验。
        Set<Long> requestIds = candidates.stream().map(InpatientOrderTask::requestId)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        Map<Long, InpatientOrderWorkflow> workflowByRequest = new LinkedHashMap<>();
        workflows.findByTenantIdAndRequestIdIn(context.tenantId(), requestIds)
                .forEach(value -> workflowByRequest.putIfAbsent(value.requestId(), value));
        Map<Long, InpatientCareRequest> requestById = new LinkedHashMap<>();
        requests.findByTenantIdAndIdIn(context.tenantId(), requestIds)
                .forEach(value -> requestById.putIfAbsent(value.id(), value));
        Set<Long> encounterIds = requestById.values().stream().map(InpatientCareRequest::encounterId)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        Map<Long, InpatientEncounter> encounterById = new LinkedHashMap<>();
        if (!encounterIds.isEmpty()) {
            encounters.findByTenantIdAndIdIn(context.tenantId(), encounterIds)
                    .forEach(value -> encounterById.putIfAbsent(value.id(), value));
        }
        Set<Long> authorizedDepartments = new LinkedHashSet<>();
        List<TaskContext> visible = new ArrayList<>();
        for (InpatientOrderTask task : candidates) {
            InpatientOrderWorkflow workflow = workflowByRequest.get(task.requestId());
            if (workflow == null) throw notFound("INPATIENT_ORDER_NOT_FOUND", "住院医嘱不存在");
            InpatientCareRequest request = requestById.get(task.requestId());
            if (request == null) throw notFound("INPATIENT_ORDER_NOT_FOUND", "住院医嘱事实不存在");
            InpatientEncounter encounter = requireRequestScope(context, request, encounterById, authorizedDepartments);
            if (episodeId != null && !episodeId.equals(workflow.episodeId())) continue;
            if (!targetDepartmentId.equals(encounter.departmentId())) continue;
            visible.add(new TaskContext(task, workflow, request));
        }
        if (visible.isEmpty()) return new NurseWorklistView(List.of());
        Map<Long, ResidentSnapshot> snapshots = residents.requireSnapshots(context.tenantId(),
                visible.stream().map(value -> value.request().residentId())
                        .collect(Collectors.toCollection(LinkedHashSet::new)));
        TaskAssembly assembly = taskAssembly(context, visible);
        List<TaskView> values = visible.stream()
                .map(value -> taskView(value.task(), value.workflow(), value.request(),
                        snapshots.get(value.request().residentId()).fullName(), assembly))
                .toList();
        return new NurseWorklistView(values);
    }

    /** 为工作台列表一次性预取药品明细、消费者供药快照与核销记录，避免逐任务查询。 */
    private TaskAssembly taskAssembly(ExecutionContext context, List<TaskContext> items) {
        Set<Long> medicationRequestIds = items.stream()
                .filter(value -> "MEDICATION".equals(value.request().orderCategory()))
                .map(value -> value.request().id())
                .collect(Collectors.toCollection(LinkedHashSet::new));
        Map<Long, RequestDetails> detailsByRequest = requestStore.detailsByRequest(context.tenantId(),
                medicationRequestIds);
        Map<Long, Long> requestIdByTaskId = new LinkedHashMap<>();
        for (TaskContext value : items) {
            RequestDetails details = detailsByRequest.getOrDefault(value.request().id(), RequestDetails.EMPTY);
            if (fulfillmentRequired(value.request(), details)) {
                requestIdByTaskId.put(value.task().id(), value.request().id());
            }
        }
        Map<Long, FulfillmentSnapshot> fulfillmentByTask = requestIdByTaskId.isEmpty() ? Map.of()
                : medicationFulfillment.fulfillmentsForConsumers(context.tenantId(), "INPATIENT_ORDER_TASK",
                        requestIdByTaskId);
        if (fulfillmentByTask == null) fulfillmentByTask = Map.of();
        Map<Long, List<MedicationFulfillmentDirectory.ConsumptionAllocation>> consumptionsByTask =
                medicationRequestIds.isEmpty() ? Map.of()
                        : medicationFulfillment.consumptionsForConsumers(context.tenantId(), "INPATIENT_ORDER_TASK",
                                items.stream().filter(value -> "MEDICATION".equals(value.request().orderCategory()))
                                        .map(value -> value.task().id())
                                        .collect(Collectors.toCollection(LinkedHashSet::new)));
        if (consumptionsByTask == null) consumptionsByTask = Map.of();
        return new TaskAssembly(detailsByRequest, fulfillmentByTask, consumptionsByTask);
    }

    private static boolean fulfillmentRequired(InpatientCareRequest request, RequestDetails details) {
        return "MEDICATION".equals(request.orderCategory()) && !details.selfProvided();
    }

    private TaskView completeTask(Long taskId, TaskCommand input, boolean skip) {
        ExecutionContext context = requireAction();
        String commandCode = requireCommand(input.commandCode());
        TaskView replay = replayTask(context, commandCode);
        if (replay != null) return replay;
        InpatientOrderTask task = tasks.findLocked(context.tenantId(), taskId)
                .orElseThrow(() -> notFound("INPATIENT_TASK_NOT_FOUND", "住院医嘱执行任务不存在"));
        replay = replayTask(context, commandCode);
        if (replay != null) return replay;
        InpatientOrderWorkflow workflow = requireLockedWorkflow(context, task.requestId());
        InpatientCareRequest request = requireLockedRequest(context, task.requestId());
        if (!Set.of("ACTIVE", "STOPPED").contains(workflow.workflowStatus())) {
            throw conflict("INPATIENT_ORDER_NOT_EXECUTABLE", "医嘱尚未核对或已结束，不能执行任务");
        }
        String taskBefore = task.status().name();
        String orderBefore = workflow.workflowStatus();
        if (skip) {
            String outcome = requiredText(input.outcomeCode(), "INPATIENT_SKIP_REASON_REQUIRED", "跳过原因编码不能为空");
            task.skip(input.expectedRevision(), requireActor(context), normalizeOptional(outcome), Strings.trimToNull(input.note()));
        } else {
            task.execute(input.expectedRevision(), requireActor(context), normalizeOptional(input.outcomeCode()),
                    Strings.trimToNull(input.note()));
            consumeMedication(task, workflow, request, commandCode, requireActor(context));
            orderCharges.postExecutedTask(task, request);
        }
        List<InpatientOrderTask> orderTasks = tasks.findLockedByRequest(context.tenantId(), workflow.requestId());
        boolean completed = workflow.completeTemporaryIf(
                !orderTasks.isEmpty() && orderTasks.stream().allMatch(InpatientOrderTask::terminal), requireActor(context));
        if (completed) request.complete();
        events.save(event(context, workflow, task, skip ? "TASK_SKIPPED" : "TASK_EXECUTED",
                orderBefore, workflow.workflowStatus(), taskBefore, task.status().name(), commandCode, Strings.trimToNull(input.note())));
        tasks.flush();
        workflows.flush();
        requests.flush();
        return taskView(task, workflow, request, residents.requireSnapshot(request.residentId()).fullName());
    }

    private OrderView replayOrder(ExecutionContext context, String commandCode) {
        return events.findByTenantIdAndCommandCode(context.tenantId(), commandCode)
                .map(value -> {
                    InpatientOrderWorkflow workflow = requireWorkflow(context, value.requestId());
                    return orderView(context, workflow, requireRequest(context, workflow.requestId()));
                }).orElse(null);
    }

    private TaskView replayTask(ExecutionContext context, String commandCode) {
        return events.findByTenantIdAndCommandCode(context.tenantId(), commandCode)
                .filter(value -> value.taskId() != null)
                .map(value -> {
                    InpatientOrderWorkflow workflow = requireWorkflow(context, value.requestId());
                    InpatientCareRequest request = requireRequest(context, workflow.requestId());
                    InpatientOrderTask task = tasks.findById(value.taskId())
                            .filter(candidate -> context.tenantId().equals(candidate.tenantId()))
                            .orElseThrow(() -> notFound("INPATIENT_TASK_NOT_FOUND", "住院医嘱执行任务不存在"));
                    return taskView(task, workflow, request, residents.requireSnapshot(request.residentId()).fullName());
                }).orElse(null);
    }

    private OrderView orderView(ExecutionContext context, InpatientOrderWorkflow workflow,
                                InpatientCareRequest request) {
        requireRequestScope(context, request);
        ResidentSnapshot resident = residents.requireSnapshot(request.residentId());
        CareEpisode episode = episodes.findByIdAndTenantId(workflow.episodeId(), context.tenantId())
                .orElseThrow(() -> notFound("INPATIENT_EPISODE_NOT_FOUND", "住院记录不存在"));
        List<InpatientOrderTask> orderTasks = tasks.findByTenantIdAndRequestIdOrderByOccurrenceNoAsc(
                context.tenantId(), request.id());
        TaskAssembly assembly = taskAssembly(context, orderTasks.stream()
                .map(task -> new TaskContext(task, workflow, request)).toList());
        return orderView(workflow, request, resident, episode, orderTasks, assembly);
    }

    /** 使用已批量装载的数据装配医嘱视图；工作台列表据此避免逐医嘱查询。 */
    private OrderView orderView(InpatientOrderWorkflow workflow, InpatientCareRequest request,
                                ResidentSnapshot resident, CareEpisode episode,
                                List<InpatientOrderTask> orderTasks, TaskAssembly assembly) {
        if (episode == null) throw notFound("INPATIENT_EPISODE_NOT_FOUND", "住院记录不存在");
        RequestDetails details = assembly.detailsByRequest().get(request.id());
        if (details == null) {
            details = requestStore.details(request.tenantId(), request.id(), request.orderCategory());
        }
        List<TaskView> taskViews = orderTasks.stream()
                .map(task -> taskView(task, workflow, request, resident.fullName(), assembly))
                .toList();
        MedicationClosureView medicationClosure = medicationClosure(workflow, request);
        return new OrderView(request.id(), workflow.revision(), request.requestNo(), request.orderCategory(),
                workflow.durationType(), workflow.workflowStatus(), workflow.episodeId(), episode.episodeNo(),
                request.encounterId(), request.residentId(), resident.fullName(), request.performerOrganizationId(),
                request.performerDepartmentId(), request.catalogItemId(), details.medicationId(),
                request.itemCodeSnapshot(), request.itemNameSnapshot(), request.unitCodeSnapshot(),
                details.dosageAmount(), details.dosageUnit(), details.routeCode(), details.frequencyCode(),
                request.reasonText(), workflow.authoredPractitionerId(), request.authoredBy(), request.authoredAt(),
                workflow.signedBy(), workflow.signedAt(), workflow.verifiedBy(), workflow.verifiedAt(),
                workflow.stoppedBy(), workflow.stoppedAt(), workflow.stopReason(), medicationClosure, taskViews);
    }

    private MedicationClosureView medicationClosure(InpatientOrderWorkflow workflow, InpatientCareRequest request) {
        if (!"MEDICATION".equals(request.orderCategory()) || !"STOPPED".equals(workflow.workflowStatus())) return null;
        var closure = medicationStops.closure(request.tenantId(), request.id());
        return new MedicationClosureView(closure.status(), closure.dispenseTaskId(), closure.pharmacyTaskStatus(),
                closure.dispensedQuantity(), closure.consumedQuantity(), closure.returnedQuantity(),
                closure.returnableQuantity(), closure.unitCode(), closure.deliveryId(), closure.deliveryStatus(),
                closure.action());
    }

    private TaskView taskView(InpatientOrderTask task, InpatientOrderWorkflow workflow,
                              InpatientCareRequest request, String residentName) {
        return taskView(task, workflow, request, residentName, TaskAssembly.EMPTY);
    }

    /** 装配执行任务视图；工作台列表通过预取结果一次取回明细、供药快照与核销记录，单任务路径回落到逐条查询。 */
    private TaskView taskView(InpatientOrderTask task, InpatientOrderWorkflow workflow,
                              InpatientCareRequest request, String residentName, TaskAssembly assembly) {
        RequestDetails details = assembly.detailsByRequest().get(request.id());
        if (details == null) {
            details = requestStore.details(request.tenantId(), request.id(), request.orderCategory());
        }
        boolean fulfillmentRequired = fulfillmentRequired(request, details);
        FulfillmentSnapshot fulfillment = fulfillmentRequired
                ? assembly.fulfillmentByTask().get(task.id())
                : new FulfillmentSnapshot(true, null, BigDecimal.ZERO, "NOT_REQUIRED");
        if (fulfillmentRequired && fulfillment == null) {
            fulfillment = medicationFulfillment.fulfillmentForConsumer(request.tenantId(), request.id(),
                    "INPATIENT_ORDER_TASK", task.id());
        }
        // Preserve compatibility for fulfillment adapters that only implement the earlier request-level contract.
        if (fulfillmentRequired && fulfillment == null) {
            fulfillment = medicationFulfillment.fulfillmentForRequest(request.tenantId(), request.id());
        }
        List<MedicationFulfillmentDirectory.ConsumptionAllocation> consumptions =
                assembly.consumptionsByTask().get(task.id());
        if (consumptions == null) {
            consumptions = medicationFulfillment.consumptionsFor(request.tenantId(), "INPATIENT_ORDER_TASK",
                    task.id());
        }
        List<MedicationConsumptionView> medicationConsumptions = consumptions.stream()
                .map(value -> new MedicationConsumptionView(value.id(), value.dispenseTaskLineId(),
                        value.dispenseId(), value.dispenseLineId(),
                        value.consumedQuantity(), value.dispenseUnitCode(), value.consumedBaseQuantity(),
                        value.baseUnitCode(), value.commandCode(), value.consumedAt()))
                .toList();
        return new TaskView(task.id(), task.revision(), request.id(), request.requestNo(), request.orderCategory(),
                workflow.durationType(), workflow.episodeId(), request.encounterId(), request.residentId(), residentName,
                request.performerOrganizationId(), request.performerDepartmentId(), request.itemCodeSnapshot(),
                request.itemNameSnapshot(), request.unitCodeSnapshot(), details.dosageAmount(), details.dosageUnit(),
                details.routeCode(), details.frequencyCode(), request.reasonText(), task.occurrenceNo(),
                task.scheduledAt(), task.status().name(), task.outcomeCode(), task.executionNote(), task.completedAt(),
                task.completedBy(), task.cancelledAt(), task.cancelReason(), fulfillmentRequired,
                fulfillment.completed() || !medicationConsumptions.isEmpty(),
                fulfillment.dispenseId(), fulfillment.netDispensedQuantity(),
                fulfillment.status(), medicationConsumptions);
    }

    private void consumeMedication(InpatientOrderTask task, InpatientOrderWorkflow workflow,
                                   InpatientCareRequest request,
                                   String commandCode, Long actorId) {
        if (!"MEDICATION".equals(request.orderCategory())) return;
        RequestDetails details = requestStore.details(request.tenantId(), request.id(), request.orderCategory());
        if (details.selfProvided()) return;
        if (workflow.medicationBaseQuantityPerOccurrence() == null || workflow.medicationBaseUnit() == null) {
            throw conflict("INPATIENT_MEDICATION_QUANTITY_SNAPSHOT_MISSING",
                    "住院药品医嘱缺少基础数量快照，不能安全核销发药明细");
        }
        var consumption = medicationFulfillment.consume(new ConsumptionCommand(request.tenantId(), request.id(),
                "INPATIENT_ORDER_TASK", task.id(), workflow.medicationBaseQuantityPerOccurrence(),
                workflow.medicationBaseUnit(),
                commandCode, actorId));
        consumption.allocations().forEach(value -> {
            var gate = wardDeliveries.deliveryGate(request.tenantId(), value.dispenseId());
            if (gate.deliveryRequired() && !gate.ready()) {
                throw conflict("INPATIENT_MEDICATION_WARD_RECEIPT_REQUIRED",
                        "药品配送尚未完成病区签收，不能执行本次给药");
            }
        });
    }

    private AllergyReview requireMedicationAllergyReview(
            InpatientCareRequest request, SignOrderCommand input) {
        if (!"MEDICATION".equals(request.orderCategory())) return null;
        List<AllergySnapshot> active = allergies.activeForResident(request.residentId());
        List<AllergySnapshot> drugAllergies = active.stream().filter(AllergySnapshot::isDrugAllergy).toList();
        boolean statusRecorded = !drugAllergies.isEmpty() || active.stream().anyMatch(value ->
                "NO_KNOWN_ALLERGY".equals(value.assertionType())
                        || "NO_KNOWN_DRUG_ALLERGY".equals(value.assertionType()));
        if (!statusRecorded) {
            throw conflict("INPATIENT_MEDICATION_ALLERGY_STATUS_UNKNOWN",
                    "患者药物过敏状态尚未确认，签署药品医嘱前必须完成核对");
        }
        if (!drugAllergies.isEmpty() && !Boolean.TRUE.equals(input.allergyReviewConfirmed())) {
            throw conflict("INPATIENT_MEDICATION_ALLERGY_REVIEW_REQUIRED",
                    "患者存在有效药物过敏记录，签署药品医嘱前必须显式确认");
        }
        RequestDetails details = requestStore.details(request.tenantId(), request.id(), request.orderCategory());
        List<AllergySnapshot> matched = drugAllergies.stream()
                .filter(value -> value.allergenId() != null && details.medicationId() != null
                        ? terminologyDirectory.medicationMatchesAllergen(
                                request.tenantId(), details.medicationId(), value.allergenId())
                        : value.substanceCode() != null && details.medicationCode() != null
                        && value.substanceCode().equalsIgnoreCase(details.medicationCode()))
                .toList();
        String overrideReason = Strings.trimToNull(input.allergyOverrideReason());
        if (!matched.isEmpty() && overrideReason == null) {
            throw conflict("INPATIENT_MEDICATION_ALLERGY_MATCH",
                    "所选药品命中患者过敏原，继续签署必须填写临床覆盖理由");
        }
        String eventReason = "过敏核对已确认；活动药物过敏 " + drugAllergies.size()
                + " 条；命中 " + matched.size() + " 条"
                + (overrideReason == null ? "" : "；覆盖理由：" + overrideReason);
        return new AllergyReview(eventReason);
    }

    private InpatientOrderEvent event(ExecutionContext context, InpatientOrderWorkflow workflow,
                                      InpatientOrderTask task, String type, String orderFrom, String orderTo,
                                      String taskFrom, String taskTo, String commandCode, String reason) {
        return new InpatientOrderEvent(context.tenantId(), workflow.requestId(), task == null ? null : task.id(),
                type, orderFrom, orderTo, taskFrom, taskTo, commandCode, reason, requireActor(context));
    }

    private void publishServiceEvent(InpatientCareRequest request, String eventType, String summary) {
        if (!"SERVICE".equals(request.orderCategory())) return;
        ServiceDetails service = requestStore.serviceDetails(request.tenantId(), request.id());
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("encounterId", request.encounterId());
        payload.put("residentId", request.residentId());
        payload.put("catalogItemId", request.catalogItemId());
        payload.put("serviceType", service.serviceType());
        payload.put("performerDepartmentId", request.performerDepartmentId());
        put(payload, "specimenType", service.specimenType());
        put(payload, "examinationType", service.examinationType());
        payload.put("authoredBy", request.authoredBy());
        payload.put("chargeQuantity", service.quantity());
        payload.put("chargeUnit", request.unitCodeSnapshot());
        payload.put("itemCode", request.itemCodeSnapshot());
        payload.put("itemName", request.itemNameSnapshot());
        put(payload, "unitPrice", request.unitPrice());
        put(payload, "totalAmount", request.totalAmount());
        put(payload, "currencyCode", request.currencyCode());
        put(payload, "requestNo", request.requestNo());
        payload.put("careSetting", "INPATIENT");
        payload.put("summary", summary);
        domainEvents.publish(request.tenantId(), request.performerOrganizationId(), eventType, 1,
                "ServiceRequest", request.id(), request.revision(), request.residentId(), Instant.now(), payload);
    }

    private static void put(Map<String, Object> payload, String key, Object value) {
        if (value != null) payload.put(key, value);
    }

    private CareEpisode requireAdmittedEpisode(ExecutionContext context, Long episodeId) {
        CareEpisode episode = episodes.findLocked(context.tenantId(), episodeId)
                .orElseThrow(() -> notFound("INPATIENT_EPISODE_NOT_FOUND", "住院记录不存在"));
        if (!context.organizationId().equals(episode.organizationId())) {
            throw forbidden("INPATIENT_ORDER_SCOPE_DENIED", "住院记录不属于当前机构");
        }
        if (episode.status() != CareEpisodeStatus.ADMITTED) {
            throw conflict("INPATIENT_EPISODE_NOT_ADMITTED", "只有在院患者可以开立住院医嘱");
        }
        return episode;
    }

    private InpatientEncounter requireActiveEncounter(ExecutionContext context, Long episodeId) {
        InpatientEncounter encounter = requireEncounterSnapshot(context, episodeId);
        if (encounter.status() != InpatientEncounterStatus.IN_PROGRESS) {
            throw conflict("INPATIENT_ENCOUNTER_NOT_ACTIVE", "住院接触已结束，不能开立医嘱");
        }
        return encounter;
    }

    private InpatientEncounter requireEncounterSnapshot(ExecutionContext context, Long episodeId) {
        InpatientEncounter encounter = encounters.findByTenantIdAndEpisodeId(context.tenantId(), episodeId)
                .orElseThrow(() -> notFound("INPATIENT_ENCOUNTER_NOT_FOUND", "住院接触不存在"));
        if (!context.organizationId().equals(encounter.organizationId())) {
            throw forbidden("INPATIENT_ORDER_SCOPE_DENIED", "住院接触不属于当前机构");
        }
        return encounter;
    }

    private InpatientOrderWorkflow requireLockedWorkflow(ExecutionContext context, Long requestId) {
        InpatientOrderWorkflow workflow = workflows.findLocked(context.tenantId(), requestId)
                .orElseThrow(() -> notFound("INPATIENT_ORDER_NOT_FOUND", "住院医嘱不存在"));
        requireMutableEpisode(context, workflow.episodeId());
        requireRequest(context, requestId);
        return workflow;
    }

    private InpatientOrderWorkflow requireWorkflow(ExecutionContext context, Long requestId) {
        InpatientOrderWorkflow workflow = workflows.findByRequestIdAndTenantId(requestId, context.tenantId())
                .orElseThrow(() -> notFound("INPATIENT_ORDER_NOT_FOUND", "住院医嘱不存在"));
        requireRequest(context, requestId);
        return workflow;
    }

    private InpatientCareRequest requireLockedRequest(ExecutionContext context, Long requestId) {
        InpatientCareRequest request = requests.findLocked(context.tenantId(), requestId)
                .orElseThrow(() -> notFound("INPATIENT_ORDER_NOT_FOUND", "住院医嘱事实不存在"));
        requireRequestScope(context, request);
        return request;
    }

    private InpatientCareRequest requireRequest(ExecutionContext context, Long requestId) {
        InpatientCareRequest request = requests.findByIdAndTenantId(requestId, context.tenantId())
                .orElseThrow(() -> notFound("INPATIENT_ORDER_NOT_FOUND", "住院医嘱事实不存在"));
        requireRequestScope(context, request);
        return request;
    }

    private void requireRequestScope(ExecutionContext context, InpatientCareRequest request) {
        if (!context.organizationId().equals(request.performerOrganizationId())) {
            throw forbidden("INPATIENT_ORDER_SCOPE_DENIED", "住院医嘱不属于当前机构");
        }
        InpatientEncounter encounter = encounters.findByIdAndTenantId(request.encounterId(), context.tenantId())
                .orElseThrow(() -> notFound("INPATIENT_ENCOUNTER_NOT_FOUND", "住院接触不存在"));
        requireDepartmentScope(context, encounter.departmentId());
    }

    /**
     * 列表装配用的范围校验：接触已批量预取，科室授权按科室去重执行，错误语义与单条校验保持一致。
     */
    private InpatientEncounter requireRequestScope(ExecutionContext context, InpatientCareRequest request,
                                                   Map<Long, InpatientEncounter> encounterById,
                                                   Set<Long> authorizedDepartments) {
        if (!context.organizationId().equals(request.performerOrganizationId())) {
            throw forbidden("INPATIENT_ORDER_SCOPE_DENIED", "住院医嘱不属于当前机构");
        }
        InpatientEncounter encounter = encounterById.get(request.encounterId());
        if (encounter == null) throw notFound("INPATIENT_ENCOUNTER_NOT_FOUND", "住院接触不存在");
        if (authorizedDepartments.add(encounter.departmentId())) {
            requireDepartmentScope(context, encounter.departmentId());
        }
        return encounter;
    }

    private Long targetDepartment(ExecutionContext context, Long episodeId) {
        if (episodeId == null) return context.departmentId();
        CareEpisode episode = episodes.findByIdAndTenantId(episodeId, context.tenantId())
                .orElseThrow(() -> notFound("INPATIENT_EPISODE_NOT_FOUND", "住院记录不存在"));
        if (!context.organizationId().equals(episode.organizationId())) {
            throw forbidden("INPATIENT_ORDER_SCOPE_DENIED", "住院记录不属于当前机构");
        }
        Long departmentId = requireEncounterSnapshot(context, episodeId).departmentId();
        requireDepartmentScope(context, departmentId);
        return departmentId;
    }

    private void requireMutableEpisode(ExecutionContext context, Long episodeId) {
        CareEpisode episode = episodes.findByIdAndTenantId(episodeId, context.tenantId())
                .orElseThrow(() -> notFound("INPATIENT_EPISODE_NOT_FOUND", "住院记录不存在"));
        if (!context.organizationId().equals(episode.organizationId())) {
            throw forbidden("INPATIENT_ORDER_SCOPE_DENIED", "住院记录不属于当前机构");
        }
        if (episode.status() != CareEpisodeStatus.ADMITTED) {
            throw conflict("INPATIENT_EPISODE_NOT_ADMITTED", "患者已不在院，不能变更住院医嘱");
        }
    }

    private void requireDepartmentScope(ExecutionContext context, Long departmentId) {
        workContexts.requireAuthorized(context.tenantId(), requireActor(context),
                context.organizationId(), departmentId);
    }

    private ExecutionContext requireAction() {
        ExecutionContext context = requireContext();
        if (!context.hasAuthority("INPATIENT.ACCESS") && !context.hasAuthority("ROLE_ADMIN")) {
            throw forbidden("INPATIENT_ORDER_ACTION_DENIED", "当前岗位无权执行住院医嘱操作");
        }
        return context;
    }

    private ExecutionContext requireContext() {
        ExecutionContext context = contextProvider.requireCurrent();
        if (context.organizationId() == null || context.departmentId() == null) {
            throw badRequest("WORK_CONTEXT_REQUIRED", "请先选择医疗机构和病区工作上下文");
        }
        organizations.requireOrganization(context.tenantId(), context.organizationId());
        organizations.requireDepartment(context.tenantId(), context.organizationId(), context.departmentId());
        return context;
    }

    private static Long requireActor(ExecutionContext context) {
        if (context.subjectId() == null) throw forbidden("ACTOR_REQUIRED", "当前操作人身份不可用");
        return context.subjectId();
    }

    private static String requireCommand(String value) {
        return requiredText(value, "INPATIENT_COMMAND_REQUIRED", "业务请求号不能为空");
    }

    private static List<Instant> requirePlannedTimes(List<Instant> values) {
        if (values == null || values.isEmpty()) {
            throw badRequest("INPATIENT_PLAN_TIME_REQUIRED", "至少需要一个确定的执行时间");
        }
        if (values.size() > 128) throw badRequest("INPATIENT_PLAN_TOO_LARGE", "单次最多生成128项执行任务");
        if (values.stream().anyMatch(value -> value == null)) {
            throw badRequest("INPATIENT_PLAN_TIME_REQUIRED", "执行时间不能为空");
        }
        LinkedHashSet<Instant> distinct = new LinkedHashSet<>(values);
        if (distinct.size() != values.size()) {
            throw conflict("INPATIENT_PLAN_TIME_DUPLICATE", "同一批执行计划不能包含重复时间");
        }
        return distinct.stream().sorted().toList();
    }

    private static Set<String> statusFilter(String value, Collection<String> allowed, Set<String> defaults,
                                            String errorCode, String errorMessage) {
        String normalized = normalizeOptional(value);
        if (normalized == null) return defaults;
        if ("ALL".equals(normalized)) return Set.copyOf(allowed);
        if (!allowed.contains(normalized)) throw badRequest(errorCode, errorMessage);
        return Set.of(normalized);
    }

    private static String requiredEnum(String value, Collection<String> allowed, String code, String message) {
        String normalized = normalizeOptional(value);
        if (normalized == null || !allowed.contains(normalized)) throw badRequest(code, message);
        return normalized;
    }

    private static String requiredText(String value, String code, String message) {
        String trimmed = Strings.trimToNull(value);
        if (trimmed == null) throw badRequest(code, message);
        return trimmed;
    }

    private static String normalizeOptional(String value) {
        String trimmed = Strings.trimToNull(value);
        return trimmed == null ? null : trimmed.toUpperCase(Locale.ROOT);
    }

    public record CreateOrderCommand(Long episodeId, String orderCategory, String durationType,
                                     Long catalogItemId, String itemCode, String itemName,
                                     BigDecimal dosageAmount, String dosageUnit, String routeCode,
                                     String frequencyCode, String instructions, String commandCode) {}
    public record OrderCommand(long expectedRevision, String commandCode) {}
    public record SignOrderCommand(long expectedRevision, Boolean allergyReviewConfirmed,
                                   String allergyOverrideReason, String commandCode) {}
    public record PlanCommand(long expectedRevision, List<Instant> plannedTimes, String commandCode) {}
    public record TaskCommand(long expectedRevision, String outcomeCode, String note, String commandCode) {}
    public record BatchTaskItem(Long taskId, long expectedRevision) {}
    public record BatchTaskCommand(List<BatchTaskItem> items, String outcomeCode, String note,
                                   String batchCommandCode) {}
    public record StopCommand(long expectedRevision, String reason, String commandCode) {}

    private record WorkflowAndRequest(InpatientOrderWorkflow workflow, InpatientCareRequest request) {}
    private record TaskContext(InpatientOrderTask task, InpatientOrderWorkflow workflow,
                               InpatientCareRequest request) {}

    /** 列表装配预取结果；未命中的键回落到逐条查询，保持单任务路径与旧适配器语义。 */
    private record TaskAssembly(Map<Long, RequestDetails> detailsByRequest,
                                Map<Long, FulfillmentSnapshot> fulfillmentByTask,
                                Map<Long, List<MedicationFulfillmentDirectory.ConsumptionAllocation>>
                                        consumptionsByTask) {
        static final TaskAssembly EMPTY = new TaskAssembly(Map.of(), Map.of(), Map.of());
    }
    private record AllergyReview(String eventReason) {}
}
