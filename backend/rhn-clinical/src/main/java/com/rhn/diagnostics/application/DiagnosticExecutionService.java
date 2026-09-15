package com.rhn.diagnostics.application;

import com.rhn.diagnostics.api.DiagnosticExecutionTaskView;
import com.rhn.billing.api.SettlementAuthorizationDirectory;
import com.rhn.diagnostics.domain.DiagnosticExecutionTask;
import com.rhn.diagnostics.infrastructure.DiagnosticExecutionTaskRepository;
import com.rhn.healthcore.api.ResidentDirectory;
import com.rhn.outpatient.api.ServiceRequestDirectory;
import com.rhn.platform.eventing.api.DomainEventEnvelope;
import com.rhn.platform.eventing.api.IdempotentDomainEventConsumer;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.forbidden;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class DiagnosticExecutionService {
    private static final String CONSUMER = "diagnostic-execution-projection-v1";
    private static final Set<String> PROJECTED_EVENTS = Set.of(
            "SERVICE_REQUEST_AUTHORED", "SERVICE_REQUEST_CANCELLED",
            "INPATIENT_SERVICE_REQUEST_ACTIVATED", "INPATIENT_SERVICE_REQUEST_CANCELLED",
            "BILLING_SETTLEMENT_FINALIZED", "BILLING_SETTLEMENT_REVERSED",
            "DIAGNOSTIC_REPORT_RECEIVED");

    private final DiagnosticExecutionTaskRepository tasks;
    private final ServiceRequestDirectory requests;
    private final ResidentDirectory residents;
    private final SettlementAuthorizationDirectory settlements;
    private final ExecutionContextProvider contextProvider;
    private final IdempotentDomainEventConsumer eventConsumer;
    private final boolean requireSettlementAuthorization;

    public DiagnosticExecutionService(DiagnosticExecutionTaskRepository tasks,
                                      ServiceRequestDirectory requests,
                                      ResidentDirectory residents,
                                      SettlementAuthorizationDirectory settlements,
                                      ExecutionContextProvider contextProvider,
                                      IdempotentDomainEventConsumer eventConsumer,
                                      @Value("${rhn.diagnostics.require-settlement-authorization:true}")
                                      boolean requireSettlementAuthorization) {
        this.tasks = tasks; this.requests = requests; this.residents = residents; this.settlements = settlements;
        this.contextProvider = contextProvider; this.eventConsumer = eventConsumer;
        this.requireSettlementAuthorization = requireSettlementAuthorization;
    }

    @Transactional
    public List<DiagnosticExecutionTaskView> worklist(String requestType, String status) {
        ExecutionContext context = requireWorkContext();
        String typeFilter = upper(requestType); String statusFilter = upper(status);
        List<DiagnosticExecutionTask> values = tasks
                .findTop100ByTenantIdAndOrganizationIdAndDepartmentIdOrderByCreatedAtDesc(
                        context.tenantId(), context.organizationId(), context.departmentId());
        values.forEach(this::reconcileSettlement);
        return values.stream()
                .filter(value -> typeFilter == null || typeFilter.equals(value.requestType()))
                .filter(value -> statusFilter == null || statusFilter.equals(value.status()))
                .map(this::view).toList();
    }

    @Transactional
    public DiagnosticExecutionTaskView collect(Long taskId, long expectedRevision, String specimenNo, String note) {
        ExecutionContext context = requireWorkContext(); DiagnosticExecutionTask task = requireAccessible(taskId, context);
        reconcileSettlement(task);
        String number = clean(specimenNo);
        if (number == null) throw conflict("DIAGNOSTIC_SPECIMEN_NO_REQUIRED", "标本号不能为空");
        task.collect(expectedRevision, number, clean(note), context.subjectId(), Instant.now());
        tasks.flush(); return view(task);
    }

    @Transactional
    public DiagnosticExecutionTaskView start(Long taskId, long expectedRevision) {
        ExecutionContext context = requireWorkContext(); DiagnosticExecutionTask task = requireAccessible(taskId, context);
        reconcileSettlement(task);
        task.start(expectedRevision, context.subjectId(), Instant.now());
        tasks.flush(); return view(task);
    }

    @Transactional
    public DiagnosticExecutionTask requireReportable(Long taskId, long expectedRevision) {
        ExecutionContext context = requireWorkContext(); DiagnosticExecutionTask task = requireAccessible(taskId, context);
        reconcileSettlement(task);
        if (task.revision() != expectedRevision) throw conflict(
                "DIAGNOSTIC_TASK_REVISION_CONFLICT", "医技任务已被其他用户更新，请刷新后重试");
        if (!"IN_PROGRESS".equals(task.status())) throw conflict(
                "DIAGNOSTIC_REPORT_STATE_INVALID", "只有执行中的医技任务可以录入报告");
        return task;
    }

    @Transactional
    public void requireExchangeAllowed(Long requestId) {
        if (!requireSettlementAuthorization) return;
        ExecutionContext context = requireWorkContext();
        DiagnosticExecutionTask task = tasks.lockByTenantIdAndRequestId(context.tenantId(), requestId)
                .orElseGet(() -> tasks.save(create(requests.requireForDiagnosticExchange(requestId))));
        requireAccess(context, task);
        reconcileSettlement(task);
        if ("WAITING_SETTLEMENT".equals(task.status())) throw conflict(
                "DIAGNOSTIC_REQUEST_SETTLEMENT_REQUIRED", "检查检验申请尚未完成结算，不能进入执行流程");
        if (Set.of("CANCELLED", "EXCEPTION").contains(task.status())) throw conflict(
                "DIAGNOSTIC_REQUEST_EXECUTION_BLOCKED", "当前检查检验申请状态不能进入执行流程");
    }

    @EventListener
    @Transactional
    public void project(DomainEventEnvelope event) {
        if (!PROJECTED_EVENTS.contains(event.eventType())) return;
        eventConsumer.consume(CONSUMER, event, () -> apply(event));
    }

    private void apply(DomainEventEnvelope event) {
        switch (event.eventType()) {
            case "SERVICE_REQUEST_AUTHORED" -> createFromEvent(event, false);
            case "INPATIENT_SERVICE_REQUEST_ACTIVATED" -> createFromEvent(event, true);
            case "SERVICE_REQUEST_CANCELLED", "INPATIENT_SERVICE_REQUEST_CANCELLED" ->
                    tasks.lockByTenantIdAndRequestId(event.tenantId(), event.aggregateId())
                    .ifPresent(value -> value.cancel(event.occurredAt()));
            case "BILLING_SETTLEMENT_FINALIZED" -> updateSettlement(event, true);
            case "BILLING_SETTLEMENT_REVERSED" -> updateSettlement(event, false);
            case "DIAGNOSTIC_REPORT_RECEIVED" -> tasks.lockByTenantIdAndRequestId(event.tenantId(), event.aggregateId())
                    .ifPresent(value -> value.recordReport(longValue(event.payload().get("reportId")),
                            text(event.payload().get("reportStatus")), longValue(event.payload().get("receivedBy")),
                            text(event.payload().get("reportName")), event.occurredAt()));
            default -> { }
        }
    }

    private void createFromEvent(DomainEventEnvelope event, boolean inpatient) {
        String type = text(event.payload().get("serviceType"));
        if (!Set.of("LABORATORY", "EXAMINATION").contains(type)
                || tasks.findByTenantIdAndRequestId(event.tenantId(), event.aggregateId()).isPresent()) return;
        BigDecimal amount = decimal(event.payload().get("totalAmount"));
        boolean settlementRequired = !inpatient && requireSettlementAuthorization
                && amount != null && amount.signum() > 0;
        tasks.save(new DiagnosticExecutionTask(event.tenantId(), event.organizationId(),
                longValue(event.payload().get("performerDepartmentId")), event.subjectId(),
                longValue(event.payload().get("encounterId")), event.aggregateId(),
                text(event.payload().get("requestNo")), type, text(event.payload().get("itemCode")),
                text(event.payload().get("itemName")), text(event.payload().get("specimenType")),
                text(event.payload().get("examinationType")), settlementRequired, event.occurredAt()));
    }

    private void updateSettlement(DomainEventEnvelope event, boolean finalized) {
        Object raw = event.payload().get("serviceRequests");
        if (!(raw instanceof List<?> values)) return;
        Long settlementId = longValue(event.payload().get("settlementId"));
        for (Object item : values) {
            if (!(item instanceof Map<?, ?> value)) continue;
            Long requestId = longValue(value.get("requestId"));
            if (requestId == null) continue;
            tasks.lockByTenantIdAndRequestId(event.tenantId(), requestId).ifPresent(task -> {
                if (finalized) task.authorize(settlementId, event.occurredAt());
                else task.reverseAuthorization(event.occurredAt());
            });
        }
    }

    private DiagnosticExecutionTask create(ServiceRequestDirectory.ServiceRequestSnapshot value) {
        boolean settlementRequired = requireSettlementAuthorization
                && value.totalAmount() != null && value.totalAmount().signum() > 0;
        return new DiagnosticExecutionTask(value.tenantId(), value.performerOrganizationId(),
                value.performerDepartmentId(), value.residentId(), value.encounterId(), value.id(),
                value.requestNo(), value.serviceType(), value.itemCode(), value.itemName(), value.specimenType(),
                value.examinationType(), settlementRequired, value.authoredAt());
    }

    private void reconcileSettlement(DiagnosticExecutionTask task) {
        if (!requireSettlementAuthorization) return;
        Long finalized = settlements.finalizedSettlementForRequest(
                task.tenantId(), task.requestId(), "SERVICE_REQUEST").orElse(null);
        if (finalized != null) task.authorize(finalized, Instant.now());
        else if (task.settlementId() != null) task.reverseAuthorization(Instant.now());
    }

    private DiagnosticExecutionTask requireAccessible(Long id, ExecutionContext context) {
        DiagnosticExecutionTask value = tasks.lockByIdAndTenantId(id, context.tenantId())
                .orElseThrow(() -> notFound("DIAGNOSTIC_TASK_NOT_FOUND", "未找到医技执行任务"));
        requireAccess(context, value); return value;
    }

    private void requireAccess(ExecutionContext context, DiagnosticExecutionTask value) {
        if (!context.canAccessOrganization(value.organizationId()) || !context.canAccessDepartment(value.departmentId())) {
            throw forbidden("DIAGNOSTIC_TASK_FORBIDDEN", "无权访问当前工作上下文之外的医技任务");
        }
    }

    private DiagnosticExecutionTaskView view(DiagnosticExecutionTask value) {
        ResidentDirectory.ResidentSnapshot resident = residents.requireSnapshot(value.residentId());
        return new DiagnosticExecutionTaskView(value.id(), value.revision(), value.taskNo(), value.requestType(),
                value.status(), value.residentId(), resident.fullName(), resident.healthRecordNo(),
                value.encounterId(), value.requestId(), value.organizationId(), value.departmentId(),
                value.settlementId(), value.reportId(), value.itemCodeSnapshot(), value.itemNameSnapshot(),
                value.specimenTypeSnapshot(), value.examinationTypeSnapshot(), value.createdAt(),
                value.collectedAt(), value.specimenNo(), value.collectionNote(), value.startedAt(),
                value.completedAt(), value.completionNote(), value.exceptionNote());
    }

    private ExecutionContext requireWorkContext() {
        ExecutionContext context = contextProvider.requireCurrent();
        if (!context.hasWorkContext() || context.departmentId() == null) throw conflict(
                "DIAGNOSTIC_WORK_CONTEXT_REQUIRED", "请先选择医技执行机构和科室");
        return context;
    }

    private Long longValue(Object value) {
        if (value instanceof Number number) return number.longValue();
        String text = text(value); return text == null ? null : Long.valueOf(text);
    }

    private BigDecimal decimal(Object value) {
        if (value instanceof BigDecimal number) return number;
        if (value instanceof Number number) return new BigDecimal(number.toString());
        String text = text(value); return text == null ? null : new BigDecimal(text);
    }

    private String text(Object value) { return value == null ? null : clean(String.valueOf(value)); }
    private String upper(String value) { String result = clean(value); return result == null ? null : result.toUpperCase(); }
    private String clean(String value) { return value == null || value.isBlank() ? null : value.trim(); }
}
