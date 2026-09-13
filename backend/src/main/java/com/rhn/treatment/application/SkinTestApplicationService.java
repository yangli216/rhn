package com.rhn.treatment.application;

import com.rhn.billing.api.SettlementAuthorizationDirectory;
import com.rhn.healthcore.api.AllergyDirectory;
import com.rhn.healthcore.api.ResidentDirectory;
import com.rhn.outpatient.api.MedicationRequestDirectory;
import com.rhn.outpatient.api.MedicationRequestDirectory.MedicationRequestSnapshot;
import com.rhn.pharmacy.api.MedicationFulfillmentDirectory;
import com.rhn.platform.eventing.api.DomainEventPublisher;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.treatment.api.SkinTestDirectory;
import com.rhn.treatment.api.SkinTestWorkItemView;
import com.rhn.treatment.domain.SkinTestEvent;
import com.rhn.treatment.infrastructure.SkinTestEventRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.forbidden;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class SkinTestApplicationService implements SkinTestDirectory {
    private final SkinTestEventRepository events;
    private final MedicationRequestDirectory medicationRequests;
    private final ResidentDirectory residents;
    private final SettlementAuthorizationDirectory settlements;
    private final MedicationFulfillmentDirectory fulfillment;
    private final AllergyDirectory allergies;
    private final ExecutionContextProvider contextProvider;
    private final DomainEventPublisher eventPublisher;

    public SkinTestApplicationService(SkinTestEventRepository events,
                                      MedicationRequestDirectory medicationRequests,
                                      ResidentDirectory residents,
                                      SettlementAuthorizationDirectory settlements,
                                      MedicationFulfillmentDirectory fulfillment,
                                      AllergyDirectory allergies,
                                      ExecutionContextProvider contextProvider,
                                      DomainEventPublisher eventPublisher) {
        this.events = events; this.medicationRequests = medicationRequests; this.residents = residents;
        this.settlements = settlements; this.fulfillment = fulfillment; this.allergies = allergies;
        this.contextProvider = contextProvider; this.eventPublisher = eventPublisher;
    }

    @Transactional(readOnly = true)
    public List<SkinTestWorkItemView> worklist(String status, String keyword, Long encounterId) {
        ExecutionContext context = requireWorkContext();
        List<MedicationRequestSnapshot> requests = medicationRequests.activeForExecution(
                context.organizationId(), context.departmentId()).stream()
                .filter(MedicationRequestSnapshot::skinTestRequired).toList();
        Map<Long, SkinTestSnapshot> latest = latestForMedicationRequests(context.tenantId(),
                requests.stream().map(MedicationRequestSnapshot::id).toList());
        String statusFilter = upper(status); String term = upper(keyword);
        return requests.stream().filter(value -> encounterId == null || encounterId.equals(value.encounterId()))
                .map(value -> view(value, latest.get(value.id())))
                .filter(value -> statusFilter == null || statusFilter.equals(value.status()))
                .filter(value -> term == null || searchable(value).contains(term))
                .sorted((left, right) -> right.medicationRequestId().compareTo(left.medicationRequestId()))
                .toList();
    }

    @Transactional
    public SkinTestWorkItemView start(Long medicationRequestId, long expectedMedicationRevision,
                                      boolean identityVerified, String verificationMethod,
                                      String testMethod, boolean originalSolution,
                                      Long solutionCatalogItemId, String solutionName,
                                      Long stockLotId, String lotNo, BigDecimal concentration,
                                      String concentrationUnit, String bodySite, int observationMinutes) {
        ExecutionContext context = requireWorkContext();
        MedicationRequestSnapshot request = requireAccessibleRequest(medicationRequestId, context);
        if (request.revision() != expectedMedicationRevision) throw conflict(
                "SKIN_TEST_MEDICATION_REVISION_CONFLICT", "药品医嘱已被修改，请刷新后重试");
        if (!"ACTIVE".equals(request.status())) throw conflict(
                "SKIN_TEST_MEDICATION_STATE_INVALID", "只有有效药品医嘱可以执行皮试");
        if (!request.skinTestRequired()) throw conflict(
                "SKIN_TEST_NOT_REQUIRED", "当前药品医嘱不需要皮试");
        if (!identityVerified) throw conflict(
                "SKIN_TEST_IDENTITY_VERIFICATION_REQUIRED", "开始皮试前必须完成患者身份核对");
        SkinTestConfiguration configuration = configuration(request);
        if (!Objects.equals(configuration.testMethod(), clean(testMethod))
                || configuration.originalSolution() != originalSolution
                || configuration.observationMinutes() != observationMinutes) {
            throw conflict("SKIN_TEST_CONFIGURATION_MISMATCH",
                    "皮试执行参数与医嘱生成时的药品配置不一致，请刷新任务后按主数据方案执行");
        }
        List<SkinTestEvent> history = events.findByTenantIdAndMedicationRequestIdOrderByAttemptNoDesc(
                context.tenantId(), medicationRequestId);
        SkinTestEvent latest = history.isEmpty() ? null : history.get(0);
        if (latest != null && "IN_PROGRESS".equals(latest.status())) throw conflict(
                "SKIN_TEST_ALREADY_IN_PROGRESS", "当前药品已有进行中的皮试");
        if (latest != null && Set.of("NEGATIVE", "POSITIVE").contains(latest.result())) throw conflict(
                "SKIN_TEST_ALREADY_FINAL", "当前药品已有明确皮试结果，不能重复开始");
        Gate gate = gate(request);
        if (!gate.ready()) throw conflict(gate.code(), gate.message());
        Instant now = Instant.now();
        SkinTestEvent value = events.saveAndFlush(new SkinTestEvent(context.tenantId(),
                request.performerOrganizationId(), request.performerDepartmentId(), request.residentId(),
                request.encounterId(), request.id(), request.medicationId(), history.size() + 1,
                request.medicationCode(), request.medicationName(), testMethod, originalSolution,
                solutionCatalogItemId, solutionName, stockLotId, lotNo, concentration, concentrationUnit,
                clean(bodySite), clean(verificationMethod), observationMinutes,
                context.subjectId(), context.practitionerId(), now));
        publish(context, value, "SKIN_TEST_STARTED", "皮试已开始");
        return view(request, snapshot(value));
    }

    @Transactional
    public SkinTestWorkItemView complete(Long eventId, long expectedRevision, String result,
                                         BigDecimal whealDiameterMm, BigDecimal flareDiameterMm,
                                         String reactionDescription, String earlyReadReason) {
        ExecutionContext context = requireWorkContext();
        SkinTestEvent value = requireAccessibleEvent(eventId, context);
        MedicationRequestSnapshot request = requireAccessibleRequest(value.medicationRequestId(), context);
        Instant now = Instant.now();
        value.complete(expectedRevision, result, whealDiameterMm, flareDiameterMm,
                clean(reactionDescription), clean(earlyReadReason), context.subjectId(),
                context.practitionerId(), now);
        events.flush();
        if ("POSITIVE".equals(value.result())) {
            allergies.recordPositiveDrugSkinTest(value.residentId(), value.encounterId(),
                    value.medicationCodeSnapshot(), value.medicationNameSnapshot(),
                    value.reactionDescription(), now, value.id());
        }
        publish(context, value, "SKIN_TEST_COMPLETED", "皮试判读已完成");
        return view(request, snapshot(value));
    }

    @Transactional
    public SkinTestWorkItemView cancel(Long eventId, long expectedRevision, String reason) {
        ExecutionContext context = requireWorkContext();
        SkinTestEvent value = requireAccessibleEvent(eventId, context);
        MedicationRequestSnapshot request = requireAccessibleRequest(value.medicationRequestId(), context);
        value.cancel(expectedRevision, reason, context.subjectId(), Instant.now());
        events.flush();
        publish(context, value, "SKIN_TEST_CANCELLED", "皮试已取消");
        return view(request, snapshot(value));
    }

    @Override
    @Transactional(readOnly = true)
    public Map<Long, SkinTestSnapshot> latestForMedicationRequests(Long tenantId,
                                                                   Collection<Long> medicationRequestIds) {
        if (medicationRequestIds == null || medicationRequestIds.isEmpty()) return Map.of();
        Map<Long, SkinTestSnapshot> result = new LinkedHashMap<>();
        for (SkinTestEvent value : events.findByTenantIdAndMedicationRequestIdInOrderByStartedAtDesc(
                tenantId, medicationRequestIds)) {
            result.putIfAbsent(value.medicationRequestId(), snapshot(value));
        }
        return Map.copyOf(result);
    }

    private SkinTestWorkItemView view(MedicationRequestSnapshot request, SkinTestSnapshot latest) {
        ResidentDirectory.ResidentSnapshot resident = residents.requireSnapshot(request.residentId());
        SkinTestEvent event = latest == null ? null : events.findById(latest.eventId()).orElse(null);
        SkinTestConfiguration configuration = configuration(request);
        Gate gate = gate(request);
        String status = derivedStatus(event, gate);
        String gateMessage = Set.of("WAITING_SETTLEMENT", "WAITING_DISPENSE").contains(status)
                ? gate.message() : null;
        return new SkinTestWorkItemView(request.id(), request.revision(), request.requestNo(), request.residentId(),
                resident.fullName(), resident.healthRecordNo(), request.encounterId(),
                request.performerOrganizationId(), request.performerDepartmentId(), request.medicationId(),
                request.medicationCode(), request.medicationName(), request.itemName(), request.routeCode(),
                request.doseValue(), request.doseUnit(), configuration.testMethod(),
                configuration.solutionMode(), configuration.observationMinutes(), configuration.resultValidityHours(),
                configuration.instructions(), settlementRequiredBeforeStart(request, configuration),
                dispenseRequiredBeforeStart(request, configuration), status, gateMessage,
                event == null ? null : event.id(), event == null ? null : event.revision(),
                event == null ? null : event.attemptNo(), event == null ? null : event.testMethod(),
                event != null && event.originalSolution(), event == null ? null : event.solutionCatalogItemId(),
                event == null ? null : event.solutionNameSnapshot(), event == null ? null : event.stockLotId(),
                event == null ? null : event.lotNoSnapshot(), event == null ? null : event.concentration(),
                event == null ? null : event.concentrationUnit(), event == null ? null : event.bodySite(),
                event == null ? null : event.verificationMethod(),
                event == null ? null : event.observationMinutes(), event == null ? null : event.startedAt(),
                event == null ? null : event.completedAt(), event == null ? null : event.result(),
                event == null ? null : event.whealDiameterMm(), event == null ? null : event.flareDiameterMm(),
                event == null ? null : event.reactionDescription(), event == null ? null : event.earlyReadReason(),
                event == null ? null : event.performedByUserId(),
                event == null ? null : event.performedByPractitionerId(),
                event == null ? null : event.readByUserId(),
                event == null ? null : event.readByPractitionerId());
    }

    private Gate gate(MedicationRequestSnapshot request) {
        SkinTestConfiguration configuration = configuration(request);
        if (settlementRequiredBeforeStart(request, configuration)
                && settlements.finalizedSettlementForRequest(request.tenantId(), request.id(),
                "MEDICATION_REQUEST").isEmpty()) {
            return new Gate(false, "WAITING_SETTLEMENT", "SKIN_TEST_SETTLEMENT_REQUIRED",
                    "当前为原液皮试，药品费用尚未完成结算，暂不能开始皮试");
        }
        if (dispenseRequiredBeforeStart(request, configuration) && !fulfillment.fulfillmentForRequest(
                request.tenantId(), request.id()).completed()) {
            return new Gate(false, "WAITING_DISPENSE", "SKIN_TEST_DISPENSE_REQUIRED",
                    "当前为原液皮试，皮试用药尚未完成发药，暂不能开始皮试");
        }
        return new Gate(true, "PENDING", null, null);
    }

    private boolean settlementRequiredBeforeStart(MedicationRequestSnapshot request,
                                                  SkinTestConfiguration configuration) {
        return configuration.originalSolution() && request.totalAmount() != null
                && request.totalAmount().signum() > 0;
    }

    private boolean dispenseRequiredBeforeStart(MedicationRequestSnapshot request,
                                                SkinTestConfiguration configuration) {
        return configuration.originalSolution() && !request.selfProvided();
    }

    private String derivedStatus(SkinTestEvent event, Gate gate) {
        if (event != null && "IN_PROGRESS".equals(event.status())) return "IN_PROGRESS";
        if (event != null && "COMPLETED".equals(event.status())) return event.result();
        return gate.status();
    }

    private MedicationRequestSnapshot requireAccessibleRequest(Long requestId, ExecutionContext context) {
        MedicationRequestSnapshot value = medicationRequests.requireForRouting(context.tenantId(), requestId);
        if (!context.canAccessOrganization(value.performerOrganizationId())
                || !context.canAccessDepartment(value.performerDepartmentId())) {
            throw forbidden("SKIN_TEST_REQUEST_FORBIDDEN", "无权访问当前工作上下文之外的皮试医嘱");
        }
        return value;
    }

    private SkinTestEvent requireAccessibleEvent(Long eventId, ExecutionContext context) {
        SkinTestEvent value = events.lockByIdAndTenantId(eventId, context.tenantId())
                .orElseThrow(() -> notFound("SKIN_TEST_EVENT_NOT_FOUND", "未找到皮试记录"));
        if (!context.canAccessOrganization(value.organizationId()) || !context.canAccessDepartment(value.departmentId())) {
            throw forbidden("SKIN_TEST_EVENT_FORBIDDEN", "无权访问当前工作上下文之外的皮试记录");
        }
        return value;
    }

    private void publish(ExecutionContext context, SkinTestEvent value, String eventType, String summary) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("medicationRequestId", value.medicationRequestId());
        payload.put("encounterId", value.encounterId()); payload.put("departmentId", value.departmentId());
        payload.put("status", value.status());
        if (value.result() != null) payload.put("result", value.result());
        payload.put("summary", summary); payload.put("actorId", context.subjectId());
        eventPublisher.publish(value.tenantId(), value.organizationId(), eventType, 1,
                "SkinTestEvent", value.id(), value.revision(), value.residentId(), Instant.now(), payload);
    }

    private SkinTestSnapshot snapshot(SkinTestEvent value) {
        String status = "COMPLETED".equals(value.status()) ? value.result() : value.status();
        return new SkinTestSnapshot(value.id(), value.revision(), value.medicationRequestId(), status,
                value.result(), value.startedAt(), value.completedAt());
    }

    private String searchable(SkinTestWorkItemView value) {
        return (value.residentName() + " " + value.healthRecordNo() + " " + value.requestNo() + " "
                + value.medicationCode() + " " + value.medicationName() + " " + value.itemName())
                .toUpperCase(Locale.ROOT);
    }
    private String snapshotText(MedicationRequestSnapshot request, String field, String fallback) {
        if (request.medicationSnapshot() == null || request.medicationSnapshot().path(field).isMissingNode()
                || request.medicationSnapshot().path(field).isNull()) return fallback;
        String value = clean(request.medicationSnapshot().path(field).asText());
        return value == null ? fallback : value;
    }
    private int snapshotInt(MedicationRequestSnapshot request, String field, int fallback) {
        if (request.medicationSnapshot() == null) return fallback;
        int value = request.medicationSnapshot().path(field).asInt(fallback);
        return value > 0 ? value : fallback;
    }
    private SkinTestConfiguration configuration(MedicationRequestSnapshot request) {
        String solutionMode = resolvedAttributeText(request, "MED.SKIN_TEST.SOLUTION_MODE");
        if (solutionMode == null) solutionMode = snapshotText(request, "skinTestSolutionMode", "DILUTED_SOLUTION");
        return new SkinTestConfiguration(snapshotText(request, "skinTestMethod", "INTRADERMAL"), solutionMode,
                snapshotInt(request, "skinTestObservationMinutes", 20),
                snapshotInt(request, "skinTestResultValidityHours", 24),
                snapshotText(request, "skinTestInstructions", null));
    }
    private String resolvedAttributeText(MedicationRequestSnapshot request, String code) {
        if (request.itemAttributeSnapshot() == null) return null;
        var attribute = request.itemAttributeSnapshot().path("attributes").path(code);
        String sourceLevel = clean(attribute.path("sourceLevel").asText());
        if (sourceLevel == null || Set.of("DEFINITION_DEFAULT", "TYPE_DEFAULT", "NONE").contains(sourceLevel)) {
            return null;
        }
        var value = attribute.path("value");
        if (value.isMissingNode() || value.isNull()) return null;
        return clean(value.asText());
    }
    private ExecutionContext requireWorkContext() {
        ExecutionContext context = contextProvider.requireCurrent();
        if (!context.hasWorkContext() || context.departmentId() == null) throw conflict(
                "SKIN_TEST_WORK_CONTEXT_REQUIRED", "请先选择皮试执行机构和科室");
        return context;
    }
    private String upper(String value) { String result = clean(value); return result == null ? null : result.toUpperCase(Locale.ROOT); }
    private String clean(String value) { return value == null || value.isBlank() ? null : value.trim(); }

    private record Gate(boolean ready, String status, String code, String message) {}
    private record SkinTestConfiguration(String testMethod, String solutionMode, int observationMinutes,
                                         int resultValidityHours, String instructions) {
        private boolean originalSolution() { return "ORIGINAL_SOLUTION".equals(solutionMode); }
    }
}
