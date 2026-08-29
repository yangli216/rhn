package com.rhn.workmanagement.task;

import com.rhn.platform.eventing.api.DomainEventEnvelope;
import com.rhn.platform.eventing.application.IdempotentEventConsumer;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Set;

import static com.rhn.shared.api.BusinessErrors.forbidden;
import static com.rhn.shared.api.BusinessErrors.notFound;
import static com.rhn.shared.api.BusinessErrors.conflict;

@Service
public class TaskService {
    private static final Set<TaskStatus> OPEN = Set.of(TaskStatus.READY, TaskStatus.IN_PROGRESS);
    private final WorkTaskRepository repository;
    private final WorkTaskHistoryRepository historyRepository;
    private final ExecutionContextProvider contextProvider;
    private final IdempotentEventConsumer eventConsumer;

    public TaskService(WorkTaskRepository repository, WorkTaskHistoryRepository historyRepository,
                       ExecutionContextProvider contextProvider, IdempotentEventConsumer eventConsumer) {
        this.repository = repository;
        this.historyRepository = historyRepository;
        this.contextProvider = contextProvider;
        this.eventConsumer = eventConsumer;
    }

    @Transactional(readOnly = true)
    public List<TaskResponse> myQueue() {
        ExecutionContext context = requireWorkContext();
        return queue(context).stream().map(TaskResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public TaskSummaryResponse summary() {
        ExecutionContext context = requireWorkContext();
        List<WorkTask> tasks = queue(context);
        Instant now = Instant.now();
        long ready = tasks.stream().filter(task -> task.status() == TaskStatus.READY).count();
        long inProgress = tasks.stream().filter(task -> task.status() == TaskStatus.IN_PROGRESS).count();
        long overdue = tasks.stream().filter(task -> task.dueAt() != null && task.dueAt().isBefore(now)).count();
        return new TaskSummaryResponse(ready, inProgress, overdue, tasks.size());
    }

    @Transactional
    public TaskResponse claim(Long id) {
        ExecutionContext context = requireWorkContext();
        WorkTask task = requireAccessible(id, context);
        TaskStatus before = task.claim(context.subjectId());
        historyRepository.save(new WorkTaskHistory(task, "CLAIM", before, context.subjectId(), null,
                context.correlationId()));
        return TaskResponse.from(task);
    }

    @Transactional
    public TaskResponse complete(Long id, String comment) {
        ExecutionContext context = requireWorkContext();
        WorkTask task = requireAccessible(id, context);
        if ("CLINICAL_DOCUMENT_SIGN".equals(task.taskType())) {
            throw conflict("TASK_BUSINESS_ACTION_REQUIRED", "请进入门诊病历执行签署，签署成功后待办将自动完成");
        }
        TaskStatus before = task.complete(context.subjectId());
        historyRepository.save(new WorkTaskHistory(task, "COMPLETE", before, context.subjectId(), comment,
                context.correlationId()));
        return TaskResponse.from(task);
    }

    @EventListener
    @Transactional
    public void projectEncounterEvents(DomainEventEnvelope event) {
        if (!Set.of("OUTPATIENT_REGISTERED", "ENCOUNTER_STARTED", "ENCOUNTER_COMPLETED",
                "CLINICAL_DOCUMENT_READY_FOR_SIGNATURE", "CLINICAL_DOCUMENT_SIGNED",
                "CARE_TASK_READY").contains(event.eventType())) return;
        eventConsumer.consume("work-task-projector", event, () -> {
            if (event.eventType().equals("OUTPATIENT_REGISTERED")) createEncounterTask(event);
            else if (event.eventType().equals("CLINICAL_DOCUMENT_READY_FOR_SIGNATURE")) createSignatureTask(event);
            else if (event.eventType().equals("CLINICAL_DOCUMENT_SIGNED")) completeSignatureTask(event);
            else if (event.eventType().equals("CARE_TASK_READY")) createCareTaskProjection(event);
            else completeEncounterTask(event);
        });
    }

    private void createCareTaskProjection(DomainEventEnvelope event) {
        String dedupKey = "CARE_TASK:" + event.aggregateId();
        if (repository.existsByTenantIdAndDedupKey(event.tenantId(), dedupKey)) return;
        WorkTask task = WorkTask.departmentTask(event.tenantId(), event.organizationId(),
                longPayload(event, "departmentId"), "CONTINUOUS_CARE", textPayload(event, "title", "连续照护任务"),
                textPayload(event, "summary", "居民连续照护任务待处理"),
                TaskPriority.valueOf(textPayload(event, "priority", "NORMAL")),
                event.subjectId(), longPayload(event, "encounterId"), event.aggregateType(), event.aggregateId(),
                "/care-management?taskId=" + event.aggregateId(), dedupKey,
                Instant.parse(textPayload(event, "dueAt", Instant.now().toString())), actorId(event));
        repository.save(task);
        historyRepository.save(new WorkTaskHistory(task, "CREATE", null, actorId(event),
                "由权威连续照护任务投影", event.correlationId()));
    }

    private void createEncounterTask(DomainEventEnvelope event) {
        String dedupKey = "OUTPATIENT_ENCOUNTER:" + event.aggregateId();
        if (repository.existsByTenantIdAndDedupKey(event.tenantId(), dedupKey)) return;
        Long departmentId = longPayload(event, "departmentId");
        WorkTask task = WorkTask.departmentTask(event.tenantId(), event.organizationId(), departmentId,
                "OUTPATIENT_ENCOUNTER", "待接诊门诊患者", textPayload(event, "summary", "门诊挂号后等待接诊"),
                TaskPriority.NORMAL, event.subjectId(), event.aggregateId(), event.aggregateType(), event.aggregateId(),
                "/residents", dedupKey, Instant.now().plus(Duration.ofHours(2)), actorId(event));
        repository.save(task);
        historyRepository.save(new WorkTaskHistory(task, "CREATE", null, actorId(event), null, event.correlationId()));
    }

    private void completeEncounterTask(DomainEventEnvelope event) {
        repository.findByTenantIdAndSourceTypeAndSourceIdAndTaskType(event.tenantId(), event.aggregateType(),
                event.aggregateId(), "OUTPATIENT_ENCOUNTER").ifPresent(task -> {
            if (task.status() == TaskStatus.COMPLETED || task.status() == TaskStatus.CANCELLED) return;
            TaskStatus before = task.complete(actorId(event));
            historyRepository.save(new WorkTaskHistory(task, "AUTO_COMPLETE", before, actorId(event),
                    "业务状态已推进", event.correlationId()));
        });
    }

    private void createSignatureTask(DomainEventEnvelope event) {
        int documentVersion = intPayload(event, "documentVersion");
        String dedupKey = "CLINICAL_DOCUMENT_SIGN:" + event.aggregateId() + ":" + documentVersion;
        if (repository.existsByTenantIdAndDedupKey(event.tenantId(), dedupKey)) return;
        repository.findByTenantIdAndSourceTypeAndSourceIdAndTaskTypeOrderByCreatedAtDesc(
                event.tenantId(), event.aggregateType(), event.aggregateId(), "CLINICAL_DOCUMENT_SIGN")
                .stream().filter(task -> OPEN.contains(task.status())).forEach(task -> {
                    TaskStatus before = task.cancel();
                    historyRepository.save(new WorkTaskHistory(task, "SUPERSEDE", before, actorId(event),
                            "已有更新的文档版本等待签署", event.correlationId()));
                });
        WorkTask task = WorkTask.departmentTask(event.tenantId(), event.organizationId(),
                longPayload(event, "departmentId"), "CLINICAL_DOCUMENT_SIGN", "待签署门诊病历",
                textPayload(event, "summary", "门诊病历当前版本等待签署"), TaskPriority.HIGH,
                longPayload(event, "residentId"), longPayload(event, "encounterId"),
                event.aggregateType(), event.aggregateId(),
                "/residents?residentId=" + longPayload(event, "residentId")
                        + "&encounterId=" + longPayload(event, "encounterId"),
                dedupKey, Instant.now().plus(Duration.ofHours(4)), actorId(event));
        repository.save(task);
        historyRepository.save(new WorkTaskHistory(task, "CREATE", null, actorId(event),
                "文档版本 " + documentVersion + " 等待签署", event.correlationId()));
    }

    private void completeSignatureTask(DomainEventEnvelope event) {
        String dedupKey = "CLINICAL_DOCUMENT_SIGN:" + event.aggregateId() + ":"
                + intPayload(event, "documentVersion");
        repository.findByTenantIdAndDedupKey(event.tenantId(), dedupKey).ifPresent(task -> {
            if (task.status() == TaskStatus.COMPLETED || task.status() == TaskStatus.CANCELLED) return;
            TaskStatus before = task.complete(actorId(event));
            historyRepository.save(new WorkTaskHistory(task, "AUTO_COMPLETE", before, actorId(event),
                    "临床文档已完成签署", event.correlationId()));
        });
    }

    private List<WorkTask> queue(ExecutionContext context) {
        return repository.findQueue(context.tenantId(), context.subjectId(), context.organizationId(),
                context.departmentId(), OPEN);
    }

    private WorkTask requireAccessible(Long id, ExecutionContext context) {
        WorkTask task = repository.findByIdAndTenantId(id, context.tenantId())
                .orElseThrow(() -> notFound("TASK_NOT_FOUND", "未找到任务"));
        boolean userTask = task.assigneeType() == AssigneeType.USER && context.subjectId().equals(task.assigneeId());
        boolean departmentTask = task.assigneeType() == AssigneeType.DEPARTMENT
                && context.canAccessOrganization(task.organizationId()) && context.canAccessDepartment(task.departmentId());
        if (!userTask && !departmentTask) throw forbidden("TASK_FORBIDDEN", "无权访问该任务");
        return task;
    }

    private ExecutionContext requireWorkContext() {
        ExecutionContext context = contextProvider.requireCurrent();
        if (context.subjectId() == null || !context.hasWorkContext() || context.departmentId() == null) {
            throw forbidden("WORK_CONTEXT_REQUIRED", "请先选择机构和科室工作上下文");
        }
        return context;
    }

    private Long longPayload(DomainEventEnvelope event, String key) {
        Object value = event.payload().get(key);
        if (value instanceof Number number) return number.longValue();
        if (value instanceof String text && !text.isBlank()) return Long.valueOf(text);
        return null;
    }

    private String textPayload(DomainEventEnvelope event, String key, String fallback) {
        Object value = event.payload().get(key);
        return value == null ? fallback : value.toString();
    }

    private Long actorId(DomainEventEnvelope event) {
        return longPayload(event, "actorId");
    }

    private int intPayload(DomainEventEnvelope event, String key) {
        Object value = event.payload().get(key);
        if (value instanceof Number number) return number.intValue();
        if (value instanceof String text && !text.isBlank()) return Integer.parseInt(text);
        return 0;
    }
}
