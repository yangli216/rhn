package com.rhn.workmanagement.task;

import com.rhn.platform.eventing.api.DomainEventEnvelope;
import com.rhn.platform.eventing.api.IdempotentDomainEventConsumer;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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
    private final IdempotentDomainEventConsumer eventConsumer;

    public TaskService(WorkTaskRepository repository, WorkTaskHistoryRepository historyRepository,
                       ExecutionContextProvider contextProvider, IdempotentDomainEventConsumer eventConsumer) {
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
        String businessAction = switch (task.taskType()) {
            case "CLINICAL_DOCUMENT_SIGN" -> "请进入门诊病历执行签署，签署成功后待办将自动完成";
            case "CRITICAL_VALUE_ACKNOWLEDGE" -> "请进入危急值业务完成确认，待办不能代替危急值确认记录";
            case "OUTPATIENT_ENCOUNTER" -> "请进入门诊业务完成接诊，接诊成功后待办将自动完成";
            case "CONTINUOUS_CARE" -> "请进入连续照护业务处理，待办不能代替实际照护记录";
            default -> null;
        };
        if (businessAction != null) throw conflict("TASK_BUSINESS_ACTION_REQUIRED", businessAction);
        TaskStatus before = task.complete(context.subjectId());
        historyRepository.save(new WorkTaskHistory(task, "COMPLETE", before, context.subjectId(), comment,
                context.correlationId()));
        return TaskResponse.from(task);
    }

    @EventListener
    @Transactional
    public void projectEncounterEvents(DomainEventEnvelope event) {
        if (!Set.of("OUTPATIENT_REGISTERED", "ENCOUNTER_STARTED", "ENCOUNTER_COMPLETED", "OUTPATIENT_REGISTRATION_CANCELLED",
                "CLINICAL_DOCUMENT_READY_FOR_SIGNATURE", "CLINICAL_DOCUMENT_SIGNED",
                "CARE_TASK_READY", "DIAGNOSTIC_CRITICAL_VALUE_OPENED",
                "DIAGNOSTIC_CRITICAL_VALUE_ACKNOWLEDGED", "DIAGNOSTIC_CRITICAL_VALUE_CLOSED",
                "DIAGNOSTIC_CRITICAL_VALUE_SUPERSEDED").contains(event.eventType())) return;
        eventConsumer.consume("work-task-projector", event, () -> {
            if (event.eventType().equals("OUTPATIENT_REGISTERED")) createEncounterTask(event);
            else if (event.eventType().equals("CLINICAL_DOCUMENT_READY_FOR_SIGNATURE")) createSignatureTask(event);
            else if (event.eventType().equals("CLINICAL_DOCUMENT_SIGNED")) completeSignatureTask(event);
            else if (event.eventType().equals("CARE_TASK_READY")) createCareTaskProjection(event);
            else if (event.eventType().equals("DIAGNOSTIC_CRITICAL_VALUE_OPENED")) createCriticalValueTask(event);
            else if (event.eventType().startsWith("DIAGNOSTIC_CRITICAL_VALUE_")) completeCriticalValueTask(event);
            else completeEncounterTask(event);
        });
    }

    private void createCriticalValueTask(DomainEventEnvelope event) {
        requireCriticalStatus(event, "OPEN");
        criticalValueTask(event);
    }

    private WorkTask criticalValueTask(DomainEventEnvelope event) {
        String dedupKey = "CRITICAL_VALUE:" + event.aggregateId();
        WorkTask existing = repository.findByTenantIdAndDedupKey(event.tenantId(), dedupKey).orElse(null);
        if (existing != null) return existing;
        WorkTask task = WorkTask.userTask(event.tenantId(), event.organizationId(), requiredLongPayload(event, "departmentId"),
                requiredLongPayload(event, "recipientUserId"), "CRITICAL_VALUE_ACKNOWLEDGE",
                "检验危急值待确认：" + requiredTextPayload(event, "observationName"),
                requiredTextPayload(event, "triggerEvidence"), TaskPriority.URGENT, event.subjectId(),
                requiredLongPayload(event, "encounterId"), event.aggregateType(), event.aggregateId(),
                "/outpatient/reception?encounterId=" + requiredLongPayload(event, "encounterId"), dedupKey,
                Instant.parse(requiredTextPayload(event, "acknowledgeDeadlineAt")), actorId(event));
        repository.save(task);
        historyRepository.save(new WorkTaskHistory(task, "CREATE", null, actorId(event),
                "由危急值告警自动创建", event.correlationId()));
        return task;
    }

    private void completeCriticalValueTask(DomainEventEnvelope event) {
        String status = switch (event.eventType()) {
            case "DIAGNOSTIC_CRITICAL_VALUE_ACKNOWLEDGED" -> "ACKNOWLEDGED";
            case "DIAGNOSTIC_CRITICAL_VALUE_CLOSED" -> "CLOSED";
            case "DIAGNOSTIC_CRITICAL_VALUE_SUPERSEDED" -> "SUPERSEDED";
            default -> throw new IllegalArgumentException("Unsupported critical-value transition");
        };
        requireCriticalStatus(event, status);
        boolean acknowledged = event.payload().get("acknowledgedAt") != null
                || event.payload().get("acknowledgedBy") != null;
        if (!acknowledged && !"SUPERSEDED".equals(status)) {
            throw new IllegalArgumentException("Critical-value acknowledgement facts are missing");
        }
        Long acknowledgedBy = acknowledged ? requiredLongPayload(event, "acknowledgedBy") : null;
        Instant acknowledgedAt = acknowledged ? Instant.parse(requiredTextPayload(event, "acknowledgedAt")) : null;
        // Materialize a terminal projection even if acknowledgement/replacement arrives before OPENED.
        // A delayed OPENED event will then find this task and cannot recreate a stale pending reminder.
        WorkTask task = criticalValueTask(event);
        if (task.status() == TaskStatus.COMPLETED || task.status() == TaskStatus.CANCELLED) return;
        if (acknowledged) {
            TaskStatus before = task.completeAt(acknowledgedBy, acknowledgedAt);
            historyRepository.save(new WorkTaskHistory(task, "AUTO_COMPLETE", before, acknowledgedBy,
                    "危急值已实际确认", event.correlationId(), acknowledgedAt));
        } else {
            TaskStatus before = task.cancel();
            historyRepository.save(new WorkTaskHistory(task, "AUTO_CANCEL", before, null,
                    "报告已替代，未确认的危急值待办取消", event.correlationId(), event.occurredAt()));
        }
    }

    private void requireCriticalStatus(DomainEventEnvelope event, String expected) {
        if (!expected.equals(requiredTextPayload(event, "status"))) {
            throw new IllegalArgumentException("Critical-value event status does not match its transition");
        }
    }

    private void createCareTaskProjection(DomainEventEnvelope event) {
        String dedupKey = "CARE_TASK:" + event.aggregateId();
        String title = requiredTextPayload(event, "title");
        String summary = optionalTextPayload(event, "summary");
        TaskPriority priority = TaskPriority.valueOf(requiredTextPayload(event, "priority"));
        Instant dueAt = optionalInstantPayload(event, "dueAt");
        WorkTask existing = repository.findByTenantIdAndDedupKey(event.tenantId(), dedupKey).orElse(null);
        if (existing != null) {
            if (priority == TaskPriority.URGENT && existing.raiseCareUrgency(title, summary, dueAt)) {
                historyRepository.save(new WorkTaskHistory(existing, "URGENCY_INCREASED", existing.status(),
                        actorId(event), "来源照护任务已提高紧急程度", event.correlationId()));
            }
            return;
        }
        WorkTask task = WorkTask.departmentTask(event.tenantId(), event.organizationId(),
                longPayload(event, "departmentId"), "CONTINUOUS_CARE", title, summary, priority,
                event.subjectId(), longPayload(event, "encounterId"), event.aggregateType(), event.aggregateId(),
                "/care-management?taskId=" + event.aggregateId(), dedupKey, dueAt, actorId(event));
        repository.save(task);
        historyRepository.save(new WorkTaskHistory(task, "CREATE", null, actorId(event),
                "由权威连续照护任务投影", event.correlationId()));
    }

    private void createEncounterTask(DomainEventEnvelope event) {
        Instant dueAt = optionalInstantPayload(event, "dueAt");
        requireEncounterStatus(event, "REGISTERED");
        String dedupKey = "OUTPATIENT_ENCOUNTER:" + event.aggregateId();
        if (repository.existsByTenantIdAndDedupKey(event.tenantId(), dedupKey)) return;
        WorkTask task = newEncounterTask(event, dueAt);
        repository.save(task);
        historyRepository.save(new WorkTaskHistory(task, "CREATE", null, actorId(event), null,
                event.correlationId(), event.occurredAt()));
    }

    private WorkTask newEncounterTask(DomainEventEnvelope event, Instant dueAt) {
        if (!"Encounter".equals(event.aggregateType()) || event.subjectId() == null || event.subjectId() <= 0
                || event.organizationId() == null || event.organizationId() <= 0) {
            throw new IllegalArgumentException("Encounter task source identity is missing or invalid");
        }
        return WorkTask.departmentTask(event.tenantId(), event.organizationId(), requiredLongPayload(event, "departmentId"),
                "OUTPATIENT_ENCOUNTER", "待接诊门诊患者", optionalTextPayload(event, "summary"),
                TaskPriority.NORMAL, event.subjectId(), event.aggregateId(), event.aggregateType(), event.aggregateId(),
                "/outpatient/reception?encounterId=" + event.aggregateId(), "OUTPATIENT_ENCOUNTER:" + event.aggregateId(),
                dueAt, requiredLongPayload(event, "actorId"));
    }

    private void completeEncounterTask(DomainEventEnvelope event) {
        boolean cancelled = event.eventType().equals("OUTPATIENT_REGISTRATION_CANCELLED");
        requireEncounterStatus(event, cancelled ? "CANCELLED"
                : event.eventType().equals("ENCOUNTER_STARTED") ? "IN_PROGRESS" : "COMPLETED");
        Instant actionAt = Instant.parse(requiredTextPayload(event, cancelled ? "cancelledAt" : "startedAt"));
        Long actionBy = requiredLongPayload(event, cancelled ? "actorId" : "startedBy");
        WorkTask task = repository.findByTenantIdAndDedupKey(event.tenantId(), "OUTPATIENT_ENCOUNTER:" + event.aggregateId())
                .orElse(null);
        // Preserve the terminal fact even when the registration event has not arrived yet.
        if (task == null) {
            task = newEncounterTask(event, optionalInstantPayload(event, "dueAt"));
            repository.save(task);
        }
        if (cancelled ? task.status() == TaskStatus.CANCELLED : task.status() == TaskStatus.COMPLETED) return;
        TaskStatus before = cancelled ? task.cancelAt(actionAt) : task.completeAt(actionBy, actionAt);
        historyRepository.save(new WorkTaskHistory(task, cancelled ? "AUTO_CANCEL" : "AUTO_COMPLETE", before, actionBy,
                cancelled ? "未接诊挂号已实际取消" : "已实际开始接诊", event.correlationId(), actionAt));
    }

    private void requireEncounterStatus(DomainEventEnvelope event, String expected) {
        if (!expected.equals(requiredTextPayload(event, "status"))) {
            throw new IllegalArgumentException("Encounter event status does not match its transition");
        }
    }

    private void createSignatureTask(DomainEventEnvelope event) {
        int documentVersion = positiveIntPayload(event, "documentVersion");
        Instant dueAt = optionalInstantPayload(event, "dueAt");
        String dedupKey = signatureKey(event, documentVersion);
        if (repository.existsByTenantIdAndDedupKey(event.tenantId(), dedupKey)) return;
        WorkTask task = newSignatureTask(event, documentVersion, dueAt);
        List<WorkTask> previous = signatureTasks(event);
        if (previous.stream().mapToInt(WorkTask::signatureDocumentVersion).max().orElse(0) > documentVersion) return;
        supersedeOlderSignatureTasks(event, documentVersion, previous);
        repository.save(task);
        historyRepository.save(new WorkTaskHistory(task, "CREATE", null, actorId(event),
                "文档版本 " + documentVersion + " 等待签署", event.correlationId()));
    }

    private WorkTask newSignatureTask(DomainEventEnvelope event, int version, Instant dueAt) {
        Long residentId = requiredLongPayload(event, "residentId");
        Long encounterId = requiredLongPayload(event, "encounterId");
        return WorkTask.departmentTask(event.tenantId(), event.organizationId(),
                requiredLongPayload(event, "departmentId"), "CLINICAL_DOCUMENT_SIGN",
                "待签署：" + requiredTextPayload(event, "documentTitle"), optionalTextPayload(event, "summary"), TaskPriority.HIGH,
                residentId, encounterId, event.aggregateType(), event.aggregateId(),
                "/outpatient/reception?residentId=" + residentId + "&encounterId=" + encounterId,
                signatureKey(event, version), dueAt, actorId(event));
    }

    private String signatureKey(DomainEventEnvelope event, int version) {
        return "CLINICAL_DOCUMENT_SIGN:" + event.aggregateId() + ":" + version;
    }

    private List<WorkTask> signatureTasks(DomainEventEnvelope event) {
        return repository.findByTenantIdAndSourceTypeAndSourceIdAndTaskTypeOrderByCreatedAtDesc(
                event.tenantId(), event.aggregateType(), event.aggregateId(), "CLINICAL_DOCUMENT_SIGN");
    }

    private void supersedeOlderSignatureTasks(DomainEventEnvelope event, int version, List<WorkTask> previous) {
        // Validate every stored version before mutating any task; do not guess a legacy version.
        previous.forEach(WorkTask::signatureDocumentVersion);
        previous.stream().filter(task -> task.signatureDocumentVersion() < version && OPEN.contains(task.status()))
                .forEach(task -> {
                    TaskStatus before = task.cancel();
                    historyRepository.save(new WorkTaskHistory(task, "SUPERSEDE", before, actorId(event),
                            "已有更新的文档版本", event.correlationId(), event.occurredAt()));
                });
    }

    private void completeSignatureTask(DomainEventEnvelope event) {
        int version = positiveIntPayload(event, "documentVersion");
        Object required = event.payload().get("signatureTaskRequired");
        if (Boolean.FALSE.equals(required)) return;
        if (!Boolean.TRUE.equals(required)) throw new IllegalArgumentException("Signature task scope is missing");
        Instant signedAt = Instant.parse(requiredTextPayload(event, "signedAt"));
        Long signedBy = requiredLongPayload(event, "actorId");
        requiredLongPayload(event, "signatureEvidenceId");
        WorkTask task = repository.findByTenantIdAndDedupKey(event.tenantId(), signatureKey(event, version)).orElse(null);
        if (task != null && task.status() == TaskStatus.COMPLETED) return;
        boolean created = task == null;
        if (created) task = newSignatureTask(event, version, optionalInstantPayload(event, "dueAt"));
        supersedeOlderSignatureTasks(event, version, signatureTasks(event));
        if (created) repository.save(task);
        TaskStatus before = task.recordSignatureCompletion(signedBy, signedAt);
        historyRepository.save(new WorkTaskHistory(task, "AUTO_COMPLETE", before, signedBy,
                "临床文档版本 " + version + " 已实际签署", event.correlationId(), signedAt));
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

    private Long requiredLongPayload(DomainEventEnvelope event, String key) {
        Object value = event.payload().get(key);
        if (value instanceof Number || value instanceof String) {
            try {
                long id = new java.math.BigDecimal(value.toString()).longValueExact();
                if (id > 0) return id;
            } catch (NumberFormatException | ArithmeticException exception) {
                throw new IllegalArgumentException("Invalid event identifier: " + key, exception);
            }
        }
        throw new IllegalArgumentException("Missing or invalid event identifier: " + key);
    }

    private Long actorId(DomainEventEnvelope event) {
        return longPayload(event, "actorId");
    }

    private String optionalTextPayload(DomainEventEnvelope event, String key) {
        Object value = event.payload().get(key);
        if (value == null) return null;
        if (value instanceof String text) return text;
        throw new IllegalArgumentException("Invalid event text field: " + key);
    }

    private String requiredTextPayload(DomainEventEnvelope event, String key) {
        String value = optionalTextPayload(event, key);
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("Missing required event field: " + key);
        }
        return value;
    }

    private Instant optionalInstantPayload(DomainEventEnvelope event, String key) {
        String value = optionalTextPayload(event, key);
        return value == null ? null : Instant.parse(value);
    }

    private int positiveIntPayload(DomainEventEnvelope event, String key) {
        Object value = event.payload().get(key);
        if (!(value instanceof Number || value instanceof String)) {
            throw new IllegalArgumentException("Missing or invalid event version: " + key);
        }
        try {
            int version = new java.math.BigDecimal(value.toString()).intValueExact();
            if (version > 0) return version;
        } catch (NumberFormatException | ArithmeticException exception) {
            throw new IllegalArgumentException("Invalid event version: " + key, exception);
        }
        throw new IllegalArgumentException("Event version must be positive: " + key);
    }
}
