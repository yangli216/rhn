package com.rhn.treatment.application;

import com.rhn.billing.api.SettlementAuthorizationDirectory;
import com.rhn.healthcore.api.ResidentDirectory;
import com.rhn.outpatient.api.MedicationRequestDirectory;
import com.rhn.outpatient.api.MedicationRequestDirectory.MedicationRequestSnapshot;
import com.rhn.outpatient.api.ServiceRequestDirectory;
import com.rhn.outpatient.api.ServiceRequestDirectory.ServiceRequestSnapshot;
import com.rhn.pharmacy.api.MedicationFulfillmentDirectory;
import com.rhn.platform.eventing.api.DomainEventEnvelope;
import com.rhn.platform.eventing.api.DomainEventPublisher;
import com.rhn.platform.eventing.api.IdempotentDomainEventConsumer;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import com.rhn.treatment.api.TreatmentExecutionTaskView;
import com.rhn.treatment.api.TreatmentExecutionTaskView.TreatmentExecutionItemView;
import com.rhn.treatment.api.SkinTestDirectory;
import com.rhn.treatment.api.SkinTestDirectory.SkinTestSnapshot;
import com.rhn.treatment.domain.TreatmentExecutionItem;
import com.rhn.treatment.domain.TreatmentExecutionTask;
import com.rhn.treatment.infrastructure.TreatmentExecutionItemRepository;
import com.rhn.treatment.infrastructure.TreatmentExecutionTaskRepository;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.forbidden;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class TreatmentExecutionService {
    private static final String CONSUMER = "treatment-execution-projection-v1";
    private static final Set<String> PROJECTED_EVENTS = Set.of(
            "SERVICE_REQUEST_AUTHORED", "SERVICE_REQUEST_CANCELLED",
            "INPATIENT_SERVICE_REQUEST_ACTIVATED", "INPATIENT_SERVICE_REQUEST_CANCELLED",
            "MEDICATION_REQUEST_AUTHORED", "MEDICATION_REQUEST_ACTIVATED", "MEDICATION_REQUEST_CANCELLED",
            "BILLING_SETTLEMENT_FINALIZED", "BILLING_SETTLEMENT_REVERSED",
            "MEDICATION_DISPENSE_POSTED", "MEDICATION_RETURN_POSTED",
            "SKIN_TEST_STARTED", "SKIN_TEST_COMPLETED", "SKIN_TEST_CANCELLED");
    private final TreatmentExecutionTaskRepository tasks;
    private final TreatmentExecutionItemRepository items;
    private final ServiceRequestDirectory serviceRequests;
    private final MedicationRequestDirectory medicationRequests;
    private final ResidentDirectory residents;
    private final SettlementAuthorizationDirectory settlements;
    private final MedicationFulfillmentDirectory fulfillment;
    private final SkinTestDirectory skinTests;
    private final ExecutionContextProvider contextProvider;
    private final IdempotentDomainEventConsumer eventConsumer;
    private final DomainEventPublisher eventPublisher;
    private final JsonCodec jsonCodec;

    public TreatmentExecutionService(TreatmentExecutionTaskRepository tasks,
                                     TreatmentExecutionItemRepository items,
                                     ServiceRequestDirectory serviceRequests,
                                     MedicationRequestDirectory medicationRequests,
                                     ResidentDirectory residents,
                                     SettlementAuthorizationDirectory settlements,
                                     MedicationFulfillmentDirectory fulfillment,
                                     SkinTestDirectory skinTests,
                                     ExecutionContextProvider contextProvider,
                                     IdempotentDomainEventConsumer eventConsumer,
                                     DomainEventPublisher eventPublisher,
                                     JsonCodec jsonCodec) {
        this.tasks = tasks; this.items = items; this.serviceRequests = serviceRequests;
        this.medicationRequests = medicationRequests; this.residents = residents;
        this.settlements = settlements; this.fulfillment = fulfillment; this.skinTests = skinTests;
        this.contextProvider = contextProvider; this.eventConsumer = eventConsumer;
        this.eventPublisher = eventPublisher;
        this.jsonCodec = jsonCodec;
    }

    @Transactional
    public List<TreatmentExecutionTaskView> worklist(String taskType, String status, String keyword) {
        ExecutionContext context = requireWorkContext();
        backfill(context);
        List<TreatmentExecutionTask> values = tasks
                .findTop100ByTenantIdAndOrganizationIdAndDepartmentIdOrderByCreatedAtDesc(
                        context.tenantId(), context.organizationId(), context.departmentId());
        values.forEach(this::reconcile);
        String typeFilter = upper(taskType); String statusFilter = upper(status); String term = upper(keyword);
        return values.stream().filter(value -> typeFilter == null || typeFilter.equals(value.taskType()))
                .filter(value -> statusFilter == null || statusFilter.equals(value.status()))
                .map(this::view)
                .filter(value -> term == null || searchable(value).contains(term))
                .toList();
    }

    @Transactional
    public TreatmentExecutionTaskView start(Long taskId, long expectedRevision, boolean identityVerified,
                                            String verificationMethod, String executionSite, String note) {
        ExecutionContext context = requireWorkContext();
        TreatmentExecutionTask task = requireAccessible(taskId, context); reconcile(task);
        task.start(expectedRevision, identityVerified, clean(verificationMethod), clean(executionSite), clean(note),
                context.subjectId(), Instant.now());
        tasks.flush();
        publish(context, task, "TREATMENT_EXECUTION_STARTED", "治疗执行已开始");
        return view(task);
    }

    @Transactional
    public TreatmentExecutionTaskView complete(Long taskId, long expectedRevision, String resultCode,
                                               String note, boolean adverseReaction,
                                               String adverseReactionDetail) {
        ExecutionContext context = requireWorkContext();
        TreatmentExecutionTask task = requireAccessible(taskId, context); reconcile(task);
        task.complete(expectedRevision, resultCode, clean(note), adverseReaction, clean(adverseReactionDetail),
                context.subjectId(), Instant.now());
        tasks.flush();
        publish(context, task, "COMPLETED".equals(task.status())
                        ? "TREATMENT_EXECUTION_COMPLETED" : "TREATMENT_EXECUTION_EXCEPTION",
                "COMPLETED".equals(task.status()) ? "治疗执行已完成" : "治疗执行需后续处置");
        return view(task);
    }

    @EventListener
    @Transactional
    public void project(DomainEventEnvelope event) {
        if (!PROJECTED_EVENTS.contains(event.eventType())) return;
        eventConsumer.consume(CONSUMER, event, () -> apply(event));
    }

    private void apply(DomainEventEnvelope event) {
        switch (event.eventType()) {
            case "SERVICE_REQUEST_AUTHORED" -> createServiceFromEvent(event, false);
            case "INPATIENT_SERVICE_REQUEST_ACTIVATED" -> createServiceFromEvent(event, true);
            case "MEDICATION_REQUEST_AUTHORED", "MEDICATION_REQUEST_ACTIVATED" -> createMedicationFromEvent(event);
            case "SERVICE_REQUEST_CANCELLED", "INPATIENT_SERVICE_REQUEST_CANCELLED" ->
                    cancel(event, "SERVICE_REQUEST");
            case "MEDICATION_REQUEST_CANCELLED" -> cancel(event, "MEDICATION_REQUEST");
            case "BILLING_SETTLEMENT_FINALIZED" -> settlementChanged(event, true);
            case "BILLING_SETTLEMENT_REVERSED" -> settlementChanged(event, false);
            case "MEDICATION_DISPENSE_POSTED" -> fulfillmentChanged(event, true);
            case "MEDICATION_RETURN_POSTED" -> fulfillmentChanged(event, false);
            case "SKIN_TEST_STARTED", "SKIN_TEST_COMPLETED", "SKIN_TEST_CANCELLED" -> skinTestChanged(event);
            default -> { }
        }
    }

    private void createServiceFromEvent(DomainEventEnvelope event, boolean inpatient) {
        if (!"TREATMENT".equals(text(event.payload().get("serviceType")))) return;
        Long departmentId = longValue(event.payload().get("performerDepartmentId"));
        Long encounterId = longValue(event.payload().get("encounterId"));
        if (departmentId == null || encounterId == null) return;
        createItem(event.tenantId(), event.organizationId(), departmentId, event.subjectId(), encounterId,
                "SERVICE", event.aggregateId(), "SERVICE_REQUEST", event.aggregateId(), null,
                text(event.payload().get("requestNo")), text(event.payload().get("itemCode")),
                text(event.payload().get("itemName")), null, null, null, null, null, null, null, null, null, false,
                !inpatient && positive(event.payload().get("totalAmount")), false, event.occurredAt());
    }

    private void createMedicationFromEvent(DomainEventEnvelope event) {
        String route = text(event.payload().get("routeCode"));
        String routeExecutionType = text(event.payload().get("routeExecutionType"));
        if (routeExecutionType == null || "NONE".equals(routeExecutionType)) return;
        Long departmentId = longValue(event.payload().get("performerDepartmentId"));
        Long encounterId = longValue(event.payload().get("encounterId"));
        if (departmentId == null || encounterId == null) return;
        Long parentId = longValue(event.payload().get("parentRequestId"));
        Long groupId = parentId == null ? event.aggregateId() : parentId;
        boolean selfProvided = bool(event.payload().get("selfProvided"));
        createItem(event.tenantId(), event.organizationId(), departmentId, event.subjectId(), encounterId,
                "MEDICATION", groupId, "MEDICATION_REQUEST", event.aggregateId(), parentId,
                text(event.payload().get("requestNo")), text(event.payload().get("itemCode")),
                first(text(event.payload().get("itemName")), text(event.payload().get("medicationName"))),
                decimal(event.payload().get("doseValue")), text(event.payload().get("doseUnit")), route,
                text(event.payload().get("frequencyCode")), longValue(event.payload().get("frequencyId")),
                text(event.payload().get("frequencyName")), json(event.payload().get("frequencyRule")),
                decimal(event.payload().get("durationValue")),
                text(event.payload().get("durationUnit")), bool(event.payload().get("skinTestRequired")),
                positive(event.payload().get("totalAmount")), !selfProvided, event.occurredAt());
    }

    private void createItem(Long tenantId, Long organizationId, Long departmentId, Long residentId,
                            Long encounterId, String taskType, Long groupId, String sourceType, Long sourceId,
                            Long parentSourceId, String requestNo, String itemCode, String itemName,
                            BigDecimal doseValue, String doseUnit, String routeCode, String frequencyCode,
                            Long frequencyId, String frequencyName, String frequencyRule,
                            BigDecimal durationValue, String durationUnit, boolean skinTestRequired,
                            boolean settlementRequired, boolean fulfillmentRequired, Instant occurredAt) {
        if (items.findByTenantIdAndSourceTypeAndSourceId(tenantId, sourceType, sourceId).isPresent()) return;
        Instant createdAt = occurredAt == null ? Instant.now() : occurredAt;
        TreatmentExecutionTask task = tasks.findByTenantIdAndTaskTypeAndSourceGroupId(tenantId, taskType, groupId)
                .orElseGet(() -> tasks.save(new TreatmentExecutionTask(tenantId, organizationId, departmentId,
                        residentId, encounterId, groupId, taskType, createdAt)));
        items.save(new TreatmentExecutionItem(tenantId, task.id(), sourceType, sourceId, parentSourceId,
                first(requestNo, sourceType + sourceId), first(itemCode, sourceType), first(itemName, "门诊治疗"),
                doseValue, doseUnit, routeCode, frequencyCode, frequencyId, frequencyName, frequencyRule,
                durationValue, durationUnit, skinTestRequired,
                settlementRequired, fulfillmentRequired, createdAt));
        items.flush(); reconcile(task);
    }

    private void cancel(DomainEventEnvelope event, String sourceType) {
        items.lockBySource(event.tenantId(), sourceType, event.aggregateId()).ifPresent(item -> {
            item.cancel(event.occurredAt() == null ? Instant.now() : event.occurredAt());
            tasks.findById(item.taskId()).ifPresent(this::reconcile);
        });
    }

    private void settlementChanged(DomainEventEnvelope event, boolean finalized) {
        Long settlementId = longValue(event.payload().get("settlementId"));
        updateSettlementItems(event, finalized, settlementId, "serviceRequests", "SERVICE_REQUEST");
        updateSettlementItems(event, finalized, settlementId, "medicationRequests", "MEDICATION_REQUEST");
    }

    private void updateSettlementItems(DomainEventEnvelope event, boolean finalized, Long settlementId,
                                       String payloadKey, String sourceType) {
        Object raw = event.payload().get(payloadKey);
        if (!(raw instanceof List<?> values)) return;
        for (Object itemValue : values) {
            if (!(itemValue instanceof Map<?, ?> value)) continue;
            Long sourceId = longValue(value.get("requestId"));
            if (sourceId == null) continue;
            items.lockBySource(event.tenantId(), sourceType, sourceId).ifPresent(item -> {
                if (finalized) item.authorize(settlementId); else item.reverseAuthorization();
                tasks.findById(item.taskId()).ifPresent(this::reconcile);
            });
        }
    }

    private void fulfillmentChanged(DomainEventEnvelope event, boolean dispensed) {
        Long requestId = longValue(event.payload().get("requestId"));
        if (requestId == null) return;
        items.lockBySource(event.tenantId(), "MEDICATION_REQUEST", requestId).ifPresent(item -> {
            if (dispensed && !bool(event.payload().get("partial"))) {
                item.fulfill(longValue(event.payload().get("dispenseId")), "COMPLETED");
            } else if (!dispensed) item.reverseFulfillment("RETURNED_OR_PARTIAL");
            tasks.findById(item.taskId()).ifPresent(this::reconcile);
        });
    }

    private void skinTestChanged(DomainEventEnvelope event) {
        Long requestId = longValue(event.payload().get("medicationRequestId"));
        if (requestId == null) return;
        items.lockBySource(event.tenantId(), "MEDICATION_REQUEST", requestId).ifPresent(item ->
                tasks.findById(item.taskId()).ifPresent(this::reconcile));
    }

    private void backfill(ExecutionContext context) {
        for (ServiceRequestSnapshot value : serviceRequests.activeForExecution(
                context.organizationId(), context.departmentId())) {
            if (!"TREATMENT".equals(value.serviceType())) continue;
            createItem(value.tenantId(), value.performerOrganizationId(), value.performerDepartmentId(),
                    value.residentId(), value.encounterId(), "SERVICE", value.id(), "SERVICE_REQUEST", value.id(),
                    null, value.requestNo(), value.itemCode(), value.itemName(), null, null, null, null, null, null,
                    null, null, null, false, value.totalAmount() != null && value.totalAmount().signum() > 0,
                    false, value.authoredAt());
        }
        for (MedicationRequestSnapshot value : medicationRequests.activeForExecution(
                context.organizationId(), context.departmentId())) {
            if (value.routeExecutionType() == null || "NONE".equals(value.routeExecutionType())) continue;
            Long groupId = value.parentRequestId() == null ? value.id() : value.parentRequestId();
            createItem(value.tenantId(), value.performerOrganizationId(), value.performerDepartmentId(),
                    value.residentId(), value.encounterId(), "MEDICATION", groupId, "MEDICATION_REQUEST", value.id(),
                    value.parentRequestId(), value.requestNo(), value.itemCode(), value.itemName(), value.doseValue(),
                    value.doseUnit(), value.routeCode(), value.frequencyCode(), value.frequencyId(),
                    value.frequencyName(), value.frequencyRule() == null ? null : jsonCodec.write(value.frequencyRule()),
                    value.durationValue(),
                    value.durationUnit(), value.skinTestRequired(),
                    value.totalAmount() != null && value.totalAmount().signum() > 0, !value.selfProvided(),
                    value.authoredAt());
        }
    }

    private void reconcile(TreatmentExecutionTask task) {
        List<TreatmentExecutionItem> taskItems = items
                .findByTenantIdAndTaskIdOrderByCreatedAtAscIdAsc(task.tenantId(), task.id());
        for (TreatmentExecutionItem item : taskItems) {
            if (item.cancelled()) continue;
            if (item.settlementRequired()) {
                Long settlementId = settlements.finalizedSettlementForRequest(
                        task.tenantId(), item.sourceId(), item.sourceType()).orElse(null);
                if (settlementId == null) item.reverseAuthorization(); else item.authorize(settlementId);
            }
            if (item.fulfillmentRequired()) {
                var fact = fulfillment.fulfillmentForRequest(task.tenantId(), item.sourceId());
                if (fact.completed()) item.fulfill(fact.dispenseId(), fact.status());
                else item.reverseFulfillment(fact.status());
            }
        }
        List<TreatmentExecutionItem> active = taskItems.stream().filter(value -> !value.cancelled()).toList();
        boolean allSettled = active.stream().allMatch(TreatmentExecutionItem::settled);
        boolean allFulfilled = active.stream().allMatch(TreatmentExecutionItem::fulfilled);
        Map<Long, SkinTestSnapshot> skinTestFacts = skinTests.latestForMedicationRequests(task.tenantId(),
                active.stream().filter(TreatmentExecutionItem::skinTestRequired)
                        .map(TreatmentExecutionItem::sourceId).toList());
        boolean allSkinTestsPassed = active.stream().allMatch(value -> !value.skinTestRequired()
                || java.util.Optional.ofNullable(skinTestFacts.get(value.sourceId()))
                .map(SkinTestSnapshot::passed).orElse(false));
        boolean skinTestPositive = active.stream().filter(TreatmentExecutionItem::skinTestRequired)
                .map(value -> skinTestFacts.get(value.sourceId())).filter(java.util.Objects::nonNull)
                .anyMatch(SkinTestSnapshot::positive);
        String note = !allSettled ? "治疗相关费用已撤销或尚未结算，请暂停执行并核对"
                : !allFulfilled ? "治疗用药未完成发药或已发生退药，请暂停执行并核对"
                : skinTestPositive ? "[SKIN_TEST] 皮试阳性，当前用药禁止执行，请医生调整医嘱"
                : "治疗用药尚未取得皮试阴性结果，请暂停执行并核对";
        task.synchronize(!active.isEmpty(), allSettled, allFulfilled,
                allSkinTestsPassed, skinTestPositive, note);
    }

    private TreatmentExecutionTask requireAccessible(Long id, ExecutionContext context) {
        TreatmentExecutionTask value = tasks.lockByIdAndTenantId(id, context.tenantId())
                .orElseThrow(() -> notFound("TREATMENT_TASK_NOT_FOUND", "未找到治疗执行任务"));
        if (!context.canAccessOrganization(value.organizationId()) || !context.canAccessDepartment(value.departmentId())) {
            throw forbidden("TREATMENT_TASK_FORBIDDEN", "无权访问当前工作上下文之外的治疗任务");
        }
        return value;
    }

    private TreatmentExecutionTaskView view(TreatmentExecutionTask task) {
        ResidentDirectory.ResidentSnapshot resident = residents.requireSnapshot(task.residentId());
        List<TreatmentExecutionItem> taskItems = items
                .findByTenantIdAndTaskIdOrderByCreatedAtAscIdAsc(task.tenantId(), task.id());
        Map<Long, SkinTestSnapshot> skinTestFacts = skinTests.latestForMedicationRequests(task.tenantId(),
                taskItems.stream().filter(TreatmentExecutionItem::skinTestRequired)
                        .map(TreatmentExecutionItem::sourceId).toList());
        List<TreatmentExecutionItemView> itemViews = taskItems.stream()
                .map(value -> {
                    SkinTestSnapshot skinTest = skinTestFacts.get(value.sourceId());
                    String skinTestStatus = !value.skinTestRequired() ? "NOT_REQUIRED"
                            : skinTest == null ? "PENDING" : skinTest.status();
                    return new TreatmentExecutionItemView(value.id(), value.sourceType(), value.sourceId(),
                        value.parentSourceId(), value.requestNo(), value.itemCodeSnapshot(), value.itemNameSnapshot(),
                        value.doseValue(), value.doseUnit(), value.routeCode(), value.frequencyCode(),
                        value.frequencyId(), value.frequencyNameSnapshot(), value.frequencyRuleSnapshot(),
                        value.durationValue(), value.durationUnit(), value.skinTestRequired(),
                        skinTestStatus, skinTest == null ? null : skinTest.result(),
                        skinTest == null ? null : skinTest.eventId(),
                        value.settlementRequired(), value.settlementId(), value.fulfillmentRequired(),
                        value.fulfillmentId(), value.fulfillmentStatus(), value.cancelled(),
                        value.ready() && (!value.skinTestRequired() || skinTest != null && skinTest.passed()),
                        value.createdAt());
                }).toList();
        return new TreatmentExecutionTaskView(task.id(), task.revision(), task.taskNo(), task.taskType(), task.status(),
                task.residentId(), resident.fullName(), resident.healthRecordNo(), task.encounterId(),
                task.organizationId(), task.departmentId(), task.sourceGroupId(), task.createdAt(), task.startedAt(),
                task.startedBy(), task.verificationMethod(), task.executionSite(), task.startNote(), task.completedAt(),
                task.completedBy(), task.resultCode(), task.completionNote(), task.adverseReaction(),
                task.adverseReactionDetail(), task.exceptionNote(), itemViews);
    }

    private void publish(ExecutionContext context, TreatmentExecutionTask task, String eventType, String summary) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("encounterId", task.encounterId()); payload.put("departmentId", task.departmentId());
        payload.put("taskType", task.taskType()); payload.put("status", task.status());
        payload.put("summary", summary); payload.put("actorId", context.subjectId());
        eventPublisher.publish(task.tenantId(), task.organizationId(), eventType, 1, "TreatmentExecutionTask",
                task.id(), task.revision(), task.residentId(), Instant.now(), payload);
    }

    private ExecutionContext requireWorkContext() {
        ExecutionContext context = contextProvider.requireCurrent();
        if (!context.hasWorkContext() || context.departmentId() == null) throw conflict(
                "TREATMENT_WORK_CONTEXT_REQUIRED", "请先选择治疗执行机构和科室");
        return context;
    }

    private String searchable(TreatmentExecutionTaskView value) {
        StringBuilder result = new StringBuilder(value.taskNo()).append(' ').append(value.residentName())
                .append(' ').append(value.healthRecordNo()).append(' ').append(value.encounterId());
        value.items().forEach(item -> result.append(' ').append(item.itemCode()).append(' ')
                .append(item.itemName()).append(' ').append(item.requestNo()));
        return result.toString().toUpperCase(Locale.ROOT);
    }
    private boolean positive(Object value) { BigDecimal number = decimal(value); return number != null && number.signum() > 0; }
    private boolean bool(Object value) {
        if (value instanceof Boolean result) return result;
        if (value instanceof Number number) return number.intValue() != 0;
        return value != null && Boolean.parseBoolean(value.toString());
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
    private String text(Object value) { return value == null ? null : clean(value.toString()); }
    private String json(Object value) { return value == null ? null : jsonCodec.write(value); }
    private String first(String value, String fallback) { return clean(value) == null ? fallback : clean(value); }
    private String upper(String value) { String result = clean(value); return result == null ? null : result.toUpperCase(Locale.ROOT); }
    private String clean(String value) { return value == null || value.isBlank() ? null : value.trim(); }
}
