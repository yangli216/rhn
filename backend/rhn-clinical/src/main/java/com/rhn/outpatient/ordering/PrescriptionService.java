package com.rhn.outpatient.ordering;

import com.rhn.outpatient.api.EncounterDirectory;
import com.rhn.outpatient.api.MedicationSafetyDecision;
import com.rhn.outpatient.api.PrescriptionSafetyEvaluationDirectory;
import com.rhn.platform.eventing.api.DomainEventPublisher;
import com.rhn.platform.organization.api.OrganizationDirectory;
import com.rhn.platform.tenant.TenantContext;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.notFound;

import com.rhn.outpatient.api.OutpatientPrescriptionInventoryDirectory;
import com.rhn.outpatient.api.OutpatientPrescriptionInventoryDirectory.PrescriptionFreezeCommand;
import com.rhn.outpatient.api.OutpatientPrescriptionInventoryDirectory.PrescriptionItemFreezeRequest;
import com.rhn.outpatient.api.OutpatientPrescriptionInventoryDirectory.PrescriptionReleaseCommand;

@Service
class PrescriptionService {
    private static final DateTimeFormatter NUMBER_TIME = DateTimeFormatter.ofPattern("yyyyMMddHHmmss")
            .withZone(ZoneOffset.UTC);

    private final OrderDocumentInfoSupport documentInfoSupport;
    private final PrescriptionRepository repository;
    private final MedicationRequestRepository medicationRepository;
    private final MedicationRequestService medicationService;
    private final EncounterDirectory encounterDirectory;
    private final OrganizationDirectory organizationDirectory;
    private final DomainEventPublisher eventPublisher;
    private final ExecutionContextProvider contextProvider;
    private final OutpatientPrescriptionInventoryDirectory inventoryDirectory;
    private final PrescriptionInventoryFreezePolicy freezePolicy;
    private final PrescriptionSplitEngine splitEngine;
    private final PrescriptionSafetyEvaluationDirectory safetyEvaluations;
    private final com.rhn.shared.json.JsonCodec json;

    PrescriptionService(PrescriptionRepository repository, MedicationRequestRepository medicationRepository,
                        MedicationRequestService medicationService, EncounterDirectory encounterDirectory,
                        OrganizationDirectory organizationDirectory, DomainEventPublisher eventPublisher,
                        ExecutionContextProvider contextProvider,
                        OutpatientPrescriptionInventoryDirectory inventoryDirectory,
                        PrescriptionInventoryFreezePolicy freezePolicy,
                        PrescriptionSplitEngine splitEngine,
                        PrescriptionSafetyEvaluationDirectory safetyEvaluations, OrderDocumentInfoSupport documentInfoSupport,
                        com.rhn.shared.json.JsonCodec json) {
        this.json = json;
        this.documentInfoSupport = documentInfoSupport;
        this.repository = repository; this.medicationRepository = medicationRepository;
        this.medicationService = medicationService; this.encounterDirectory = encounterDirectory;
        this.organizationDirectory = organizationDirectory; this.eventPublisher = eventPublisher;
        this.contextProvider = contextProvider;
        this.inventoryDirectory = inventoryDirectory;
        this.freezePolicy = freezePolicy;
        this.splitEngine = splitEngine;
        this.safetyEvaluations = safetyEvaluations;
    }

    @Transactional(readOnly = true)
    List<SplitPrescriptionPlan> previewSplit(Long encounterId, List<BatchOrderMedicationItem> items) {
        var encounter = encounterDirectory.requireActiveForOrdering(encounterId);
        return splitEngine.plan(encounter, items);
    }

    @Transactional
    List<PrescriptionResponse> batchOrder(Long encounterId, BatchOrderPrescriptionRequest request) {
        var encounter = encounterDirectory.requireActiveForOrdering(encounterId);
        ExecutionContext context = contextProvider.requireCurrent();
        Long tenantId = TenantContext.requireTenantId();
        List<SplitPrescriptionPlan> plans = splitEngine.plan(encounter, request.items());
        List<PrescriptionResponse> createdPrescriptions = new java.util.ArrayList<>();

        for (SplitPrescriptionPlan plan : plans) {
            Long organizationId = encounter.organizationId();
            Long departmentId = encounter.departmentId();
            requireScope(context, tenantId, organizationId, departmentId);

            Prescription prescription = repository.saveAndFlush(new Prescription(
                    tenantId, encounter.residentId(), encounterId,
                    nextPrescriptionNo(), plan.categoryCode(), organizationId, departmentId,
                    context.subjectId(), plan.title()
            ));
            publish(prescription, "PRESCRIPTION_DRAFT_CREATED", "批量自动分方建立处方草稿",
                    Map.of("itemCount", plan.items().size(), "reasons", plan.ruleReasons()));

            Map<String, Long> groupLeaderIds = new java.util.HashMap<>();
            for (SplitPrescriptionPlan.PlannedMedicationItem plannedItem : plan.items()) {
                BatchOrderMedicationItem item = plannedItem.item();
                Long parentRequestId = null;
                if (plannedItem.groupKey() != null && !plannedItem.groupLeader()) {
                    parentRequestId = groupLeaderIds.get(plannedItem.groupKey());
                }

                CreateMedicationRequest createRequest = new CreateMedicationRequest(
                        prescription.id(),
                        item.medicationId(),
                        item.catalogItemId(),
                        item.packageId(),
                        item.doseValue(),
                        item.doseUnit(),
                        item.routeCode(),
                        item.frequencyCode(),
                        parentRequestId,
                        item.durationValue(),
                        item.durationUnit(),
                        item.quantity(),
                        item.quantityUnit(),
                        item.substitutionAllowed(),
                        item.selfProvided(),
                        item.medicationInstruction(),
                        item.allergyReviewConfirmed(),
                        item.allergyOverrideReason(),
                        item.priceType(),
                        item.pricingRequired(),
                        null,
                        organizationId,
                        departmentId,
                        item.skinTestExempt(),
                        item.skinTestExemptReason(),
                        item.exemptEvidenceEventId(),
                        item.reason() != null ? item.reason() : plan.title()
                );

                MedicationRequestResponse medResp = medicationService.create(encounterId, createRequest);
                if (plannedItem.groupKey() != null && plannedItem.groupLeader()) {
                    groupLeaderIds.put(plannedItem.groupKey(), medResp.id());
                }
            }

            if (request.autoSubmit()) {
                createdPrescriptions.add(submit(encounterId, prescription.id(),
                        new PrescriptionAction(prescription.revision(), null)));
            } else {
                createdPrescriptions.add(response(prescription));
            }
        }

        return createdPrescriptions;
    }

    @Transactional
    PrescriptionResponse create(Long encounterId, CreatePrescription input) {
        var encounter = encounterDirectory.requireActiveForOrdering(encounterId);
        ExecutionContext context = contextProvider.requireCurrent();
        Long tenantId = TenantContext.requireTenantId();
        Long organizationId = input.performerOrganizationId() == null
                ? encounter.organizationId() : input.performerOrganizationId();
        Long departmentId = input.performerDepartmentId() == null
                ? encounter.departmentId() : input.performerDepartmentId();
        requireScope(context, tenantId, organizationId, departmentId);
        Prescription value = repository.saveAndFlush(new Prescription(tenantId, encounter.residentId(), encounterId,
                nextPrescriptionNo(), clean(input.categoryCode()) == null ? "OUTPATIENT" : clean(input.categoryCode()),
                organizationId, departmentId, context.subjectId(), clean(input.note())));
        publish(value, "PRESCRIPTION_DRAFT_CREATED", "建立处方草稿", Map.of());
        return response(value);
    }

    @Transactional
    PrescriptionResponse updateDocumentInfo(Long encounterId, Long id, UpdateOrderDocumentInfo input) {
        var encounter = encounterDirectory.requireActiveForOrdering(encounterId);
        var value = repository.findByIdAndTenantId(id, encounter.tenantId())
                .filter(item -> item.encounterId().equals(encounterId))
                .orElseThrow(() -> notFound("ORDER_DOCUMENT_NOT_FOUND", "未找到本次就诊的单据"));
        String json = documentInfoSupport.validateAndWrite(encounter.tenantId(), encounterId,
                input.documentInfo(), true);
        var previousInfo = documentInfoSupport.read(value.documentInfoJson());
        value.updateDocumentInfo(input.expectedRevision(), json);
        repository.flush();
        publish(value, "ORDER_DOCUMENT_INFO_UPDATED", "修改单据信息", Map.of("updatedBy", contextProvider.requireCurrent().subjectId(),
                "before", previousInfo, "after", documentInfoSupport.read(json)));
        return response(value);
    }

    @Transactional(readOnly = true)
    List<PrescriptionResponse> list(Long encounterId) {
        var encounter = encounterDirectory.requireAccessible(encounterId);
        return repository.findByTenantIdAndEncounterIdOrderByAuthoredAtDesc(encounter.tenantId(), encounterId)
                .stream().map(this::response).toList();
    }

    @Transactional
    PrescriptionResponse submit(Long encounterId, Long prescriptionId, PrescriptionAction action) {
        var encounter = encounterDirectory.requireActiveForOrdering(encounterId);
        ExecutionContext context = contextProvider.requireCurrent();
        Prescription value = requirePrescription(encounter.tenantId(), encounterId, prescriptionId);
        List<MedicationRequest> requests = medicationService.prescriptionRequests(encounter.tenantId(), prescriptionId);
        List<MedicationRequest> drafts = requests.stream().filter(request -> "DRAFT".equals(request.status())).toList();
        if (drafts.isEmpty()) throw conflict("PRESCRIPTION_EMPTY", "处方至少需要一条有效药品请求才能提交");

        MedicationSafetyDecision safetyEvaluation = safetyEvaluations.evaluateShadow(encounterId, prescriptionId);
        enforceMedicationSafetyGate(safetyEvaluation, action);

        // 检查系统参数并执行库存冻结
        if (freezePolicy.isInventoryFreezeEnabled(context, encounter.organizationId(), encounter.departmentId())) {
            List<PrescriptionItemFreezeRequest> freezeItems = drafts.stream()
                    .filter(request -> !request.selfProvided())
                    .map(request -> new PrescriptionItemFreezeRequest(
                            request.id(), request.catalogItemId(), request.packageId(),
                            request.quantity(), request.quantityUnit()))
                    .toList();
            if (!freezeItems.isEmpty()) {
                inventoryDirectory.freezePrescription(new PrescriptionFreezeCommand(
                        encounter.tenantId(),
                        encounter.organizationId(),
                        encounter.departmentId(),
                        encounterId,
                        prescriptionId,
                        freezeItems,
                        context.subjectId()
                ));
            }
        }

        drafts.forEach(request -> medicationService.activateFromPrescription(request, encounter));
        value.submit(action.expectedRevision(), context.subjectId());
        value.recordSafetyReview(json.write(new com.rhn.outpatient.api.PrescriptionSafetyReviewDirectory.Review(
                value.id(), value.groupNo(), value.submittedAt(), clean(action.reason()), safetyEvaluation,
                requests.stream().filter(request -> !"CANCELLED".equals(request.status())).map(request ->
                    new com.rhn.outpatient.api.PrescriptionSafetyReviewDirectory.Medication(request.id(),
                        json.readTree(request.medicationSnapshot()).path("name").asString("药品名称未记录"))).toList())));
        medicationRepository.flush(); repository.flush();
        publish(value, "PRESCRIPTION_SUBMITTED", "提交门诊处方", Map.of(
                "medicationCount", drafts.size(),
                "safetyEvaluationId", safetyEvaluation.evaluationId() == null ? "" : safetyEvaluation.evaluationId(),
                "safetyDecision", safetyEvaluation.decision().name(),
                "safetyMode", safetyEvaluation.mode(), "safetyHandlingReason", clean(action.reason()) == null ? "" : clean(action.reason())));
        return response(value, safetyEvaluation);
    }

    @Transactional
    PrescriptionResponse cancel(Long encounterId, Long prescriptionId, PrescriptionAction action) {
        var encounter = encounterDirectory.requireAccessible(encounterId);
        ExecutionContext context = contextProvider.requireCurrent();
        String reason = clean(action.reason());
        if (reason == null) throw badRequest("PRESCRIPTION_CANCEL_REASON_REQUIRED", "撤销处方必须填写原因");
        Prescription value = requirePrescription(encounter.tenantId(), encounterId, prescriptionId);
        List<MedicationRequest> requests = medicationService.prescriptionRequests(encounter.tenantId(), prescriptionId);

        // 释放可能已冻结的库存
        inventoryDirectory.releasePrescription(new PrescriptionReleaseCommand(
                encounter.tenantId(),
                encounterId,
                prescriptionId,
                reason,
                context.subjectId()
        ));

        requests.forEach(request -> medicationService.cancelFromPrescription(
                request, reason, context.subjectId()));
        value.cancel(action.expectedRevision(), context.subjectId(), reason);
        medicationRepository.flush(); repository.flush();
        publish(value, "PRESCRIPTION_CANCELLED", "撤销门诊处方", Map.of(
                "medicationCount", requests.size(), "reason", reason));
        return response(value);
    }

    private Prescription requirePrescription(Long tenantId, Long encounterId, Long id) {
        return repository.findByIdAndTenantId(id, tenantId)
                .filter(value -> value.encounterId().equals(encounterId))
                .orElseThrow(() -> notFound("PRESCRIPTION_NOT_FOUND", "未找到当前就诊的处方"));
    }

    private PrescriptionResponse response(Prescription value) {
        return response(value, null);
    }

    private PrescriptionResponse response(Prescription value, MedicationSafetyDecision safetyEvaluation) {
        List<MedicationRequestResponse> requests = medicationService
                .prescriptionRequests(value.tenantId(), value.id()).stream().map(medicationService::response).toList();
        return new PrescriptionResponse(value.id(), value.revision(), value.residentId(), value.encounterId(),
                value.groupNo(), value.categoryCode(), value.status(), value.performerOrganizationId(),
                value.performerDepartmentId(), value.authoredAt(), value.authoredBy(), value.submittedAt(),
                value.submittedBy(), value.cancelledAt(), value.cancelledBy(), value.cancelReason(), value.note(), requests,
                safetyEvaluation, documentInfoSupport.read(value.documentInfoJson()));
    }

    private void enforceMedicationSafetyGate(MedicationSafetyDecision evaluation, PrescriptionAction action) {
        if ("SHADOW".equalsIgnoreCase(evaluation.mode())) return;
        if (evaluation.decision() == MedicationSafetyDecision.Status.UNAVAILABLE || evaluation.evaluationId() == null) {
            throw conflict("MEDICATION_SAFETY_UNAVAILABLE", "正式合理用药规则暂无法完成评价，请核对缺失资料或联系规则管理员后重试");
        }
        if (evaluation.decision() == MedicationSafetyDecision.Status.BLOCK) {
            throw conflict("MEDICATION_SAFETY_BLOCKED", "合理用药审查未通过，当前处方不能提交");
        }
        if (evaluation.decision() == MedicationSafetyDecision.Status.REQUIRE_OVERRIDE
                && clean(action.reason()) == null) {
            throw conflict("MEDICATION_SAFETY_OVERRIDE_REASON_REQUIRED", "合理用药审查要求填写继续开立理由");
        }
    }

    private void requireScope(ExecutionContext context, Long tenantId, Long organizationId, Long departmentId) {
        if (context.hasWorkContext() && (!context.canAccessOrganization(organizationId)
                || !context.canAccessDepartment(departmentId))) {
            throw badRequest("PRESCRIPTION_PERFORMER_CONTEXT_INVALID", "处方执行机构或科室不在当前可访问范围内");
        }
        organizationDirectory.requireDepartment(tenantId, organizationId, departmentId);
    }

    private void publish(Prescription value, String type, String summary, Map<String, Object> details) {
        Map<String, Object> payload = new LinkedHashMap<>(details);
        payload.put("prescriptionNo", value.groupNo()); payload.put("summary", summary);
        eventPublisher.publish(value.tenantId(), value.performerOrganizationId(), type, 1,
                "Prescription", value.id(), value.revision(), value.residentId(), Instant.now(), payload);
    }

    private String nextPrescriptionNo() {
        return "RX" + NUMBER_TIME.format(Instant.now()) + com.rhn.shared.id.GlobalIds.randomSuffix(6);
    }

    private String clean(String value) { return value == null || value.isBlank() ? null : value.trim(); }
}
