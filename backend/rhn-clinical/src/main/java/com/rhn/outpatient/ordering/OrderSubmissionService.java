package com.rhn.outpatient.ordering;

import com.rhn.outpatient.api.EncounterDirectory;
import com.rhn.outpatient.api.MedicationSafetyDecision;
import com.rhn.outpatient.api.PrescriptionSafetyEvaluationDirectory;
import com.rhn.platform.idempotency.IdempotencyService;
import com.rhn.shared.json.JsonCodec;
import com.rhn.shared.text.Strings;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.*;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;

/**
 * 门诊医嘱一次开立：在一个事务中核对草稿集合、合理用药确认、写入单据信息，提交全部处方并开立全部申请草稿。
 * 需要医生确认的合理用药结果先返回 REVIEW_REQUIRED 且不写单据；正式阻断、理由缺失仍由处方提交门禁拒绝并回滚整批。
 */
@Service
class OrderSubmissionService {
    private static final Set<String> DIAGNOSTIC_SERVICE_TYPES = Set.of("LABORATORY", "EXAMINATION");
    private static final String SUBMIT_OPERATION = "OUTPATIENT.ORDER.SUBMIT";
    private final EncounterDirectory encounters;
    private final PrescriptionService prescriptions;
    private final ServiceRequestService services;
    private final PrescriptionSafetyEvaluationDirectory safetyEvaluations;
    private final OrderDocumentInfoSupport documentInfos;
    private final JsonCodec json;
    private final IdempotencyService idempotency;

    OrderSubmissionService(EncounterDirectory encounters, PrescriptionService prescriptions, ServiceRequestService services,
                           PrescriptionSafetyEvaluationDirectory safetyEvaluations, OrderDocumentInfoSupport documentInfos,
                           JsonCodec json, IdempotencyService idempotency) {
        this.encounters = encounters; this.prescriptions = prescriptions; this.services = services;
        this.safetyEvaluations = safetyEvaluations; this.documentInfos = documentInfos; this.json = json;
        this.idempotency = idempotency;
    }

    @Transactional
    OrderSubmissionResponse submit(Long encounterId, OrderSubmissionRequest input) {
        var encounter = encounters.lockActiveForOrdering(encounterId);
        if (input.prescriptions().isEmpty() && input.serviceDocuments().isEmpty()) {
            throw badRequest("ORDER_SUBMISSION_EMPTY", "没有需要开立的医嘱");
        }
        var drafts = prescriptions.submittableDrafts(encounter.tenantId(), encounterId);
        // 先评价全部草稿，确认前不写任何单据。
        List<MedicationSafetyDecision> reviews = new ArrayList<>();
        for (var draft : drafts) {
            var evaluation = safetyEvaluations.evaluateShadow(encounterId, draft.id());
            if (needsAcknowledgement(evaluation)) reviews.add(evaluation);
        }
        String reviewKey = reviews.isEmpty() ? null : reviewKey(reviews);
        if (Boolean.TRUE.equals(input.dryRun())) {
            return new OrderSubmissionResponse(reviewKey == null ? OrderSubmissionResponse.Status.READY
                    : OrderSubmissionResponse.Status.REVIEW_REQUIRED, reviewKey, List.copyOf(reviews), List.of(), List.of());
        }
        // 已完成命令先回放：首次成功开立后草稿已消失，重试若先核对集合会直接报“草稿已变化”。
        // 尚未完成时不占用命令编码，只有通过全部核对、写入单据前才正式登记幂等。
        String commandCode = Strings.trimToNull(input.commandCode());
        String canonicalRequest = commandCode == null ? null : encounterId + "|" + json.write(input);
        if (commandCode != null) {
            var replay = idempotency.completedReplay(SUBMIT_OPERATION, commandCode, canonicalRequest);
            if (replay.isPresent()) return json.read(replay.get().responseJson(), OrderSubmissionResponse.class);
        }

        Map<Long, OrderSubmissionRequest.PrescriptionEntry> entries = new LinkedHashMap<>();
        for (var entry : input.prescriptions()) {
            if (entries.put(entry.id(), entry) != null) throw badRequest("ORDER_SUBMISSION_DUPLICATE", "同一处方不能重复提交");
        }
        Set<Long> draftIds = new HashSet<>();
        for (var draft : drafts) {
            draftIds.add(draft.id());
            var entry = entries.get(draft.id());
            if (entry != null && entry.expectedRevision() != draft.revision()) {
                throw conflict("PRESCRIPTION_REVISION_CONFLICT", "处方已被其他用户修改，请刷新后重新核对");
            }
        }
        if (!draftIds.equals(entries.keySet())) {
            throw conflict("ORDER_SUBMISSION_DRAFTS_CHANGED", "待开立处方已变化，请刷新后重新核对再开立");
        }
        // 草稿集合核对先于审查确认：核对过的版本已过期时先提示重新核对，不误导医生去确认旧结果。
        if (reviewKey != null && !reviewKey.equals(Strings.trimToNull(input.acknowledgedReviewKey()))) {
            return new OrderSubmissionResponse(OrderSubmissionResponse.Status.REVIEW_REQUIRED, reviewKey,
                    List.copyOf(reviews), List.of(), List.of());
        }

        // 预检只关心合理用药；申请草稿集合在正式开立时核对。
        var serviceDrafts = services.submittableDrafts(encounter.tenantId(), encounterId);
        Map<Long, OrderSubmissionRequest.ServiceDocumentEntry> serviceEntries = new LinkedHashMap<>();
        for (var entry : input.serviceDocuments()) {
            if (serviceEntries.put(entry.id(), entry) != null) {
                throw badRequest("ORDER_SUBMISSION_DUPLICATE", "同一申请不能重复提交");
            }
        }
        Set<Long> serviceDraftIds = new HashSet<>();
        for (var draft : serviceDrafts) {
            serviceDraftIds.add(draft.id());
            var entry = serviceEntries.get(draft.id());
            if (entry == null) {
                throw conflict("ORDER_SUBMISSION_DRAFTS_CHANGED", "待开立申请已变化，请刷新后重新核对再开立");
            }
            if (entry.expectedRevision() != draft.revision()) {
                throw conflict("SERVICE_REQUEST_REVISION_CONFLICT", "申请已被其他用户修改，请刷新后重新核对");
            }
        }
        for (var entry : serviceEntries.values()) {
            if (!serviceDraftIds.contains(entry.id()) && entry.documentInfo() == null) {
                throw badRequest("ORDER_DOCUMENT_INFO_REQUIRED", "已开立申请只能提交单据信息修改");
            }
        }
        // 全部核对通过后才登记命令编码：校验失败随事务回滚，命令编码仍可用于修正后重试。
        if (commandCode != null) idempotency.reserve(SUBMIT_OPERATION, commandCode, canonicalRequest);

        OrderDocumentInfo defaultInfo = defaultDocumentInfo(encounter);
        List<PrescriptionResponse> submitted = new ArrayList<>();
        for (var draft : drafts) {
            var entry = entries.get(draft.id());
            long revision = draft.revision();
            OrderDocumentInfo info = entry.documentInfo();
            if (info == null && defaultInfo != null
                    && documentInfos.read(draft.documentInfoJson()).diagnoses().isEmpty()) info = defaultInfo;
            if (info != null) {
                revision = prescriptions.updateDocumentInfo(encounterId, draft.id(),
                        new UpdateOrderDocumentInfo(revision, info)).revision();
            }
            submitted.add(prescriptions.submit(encounterId, draft.id(),
                    new PrescriptionAction(revision, Strings.trimToNull(entry.safetyReason()))));
        }
        List<ServiceRequestResponse> updatedServices = new ArrayList<>();
        for (var draft : serviceDrafts) {
            var entry = serviceEntries.get(draft.id());
            long revision = draft.revision();
            OrderDocumentInfo info = entry.documentInfo();
            if (info == null && defaultInfo != null && DIAGNOSTIC_SERVICE_TYPES.contains(draft.serviceTypeSnapshot())
                    && documentInfos.read(draft.documentInfoJson()).diagnoses().isEmpty()) info = defaultInfo;
            if (info != null) {
                revision = services.updateDocumentInfo(encounterId, draft.id(), new UpdateOrderDocumentInfo(revision, info)).revision();
            }
            updatedServices.add(services.activate(encounter, draft, revision));
        }
        for (var entry : serviceEntries.values()) {
            if (serviceDraftIds.contains(entry.id())) continue;
            updatedServices.add(services.updateDocumentInfo(encounterId, entry.id(),
                    new UpdateOrderDocumentInfo(entry.expectedRevision(), entry.documentInfo())));
        }
        OrderSubmissionResponse response = new OrderSubmissionResponse(OrderSubmissionResponse.Status.SUBMITTED, null,
                List.of(), List.copyOf(submitted), List.copyOf(updatedServices));
        if (commandCode != null) {
            idempotency.complete(SUBMIT_OPERATION, commandCode, "Encounter", encounterId, 200, json.write(response));
        }
        return response;
    }

    private OrderDocumentInfo defaultDocumentInfo(EncounterDirectory.EncounterSnapshot encounter) {
        var diagnoses = encounters.requireForPharmacy(encounter.tenantId(), encounter.id()).diagnoses();
        if (diagnoses == null || diagnoses.isEmpty()) return null;
        var primary = diagnoses.stream().filter(value -> "PRIMARY".equals(value.type())).findFirst()
                .orElse(diagnoses.getFirst());
        return new OrderDocumentInfo(List.of(new OrderDocumentInfo.DiagnosisLink(primary.code(), primary.display(), true)),
                false, null, null);
    }

    /** 与医生站 needsMedicationSafetyAcknowledgement 一致：旁路结果有提示也需医生知晓。 */
    static boolean needsAcknowledgement(MedicationSafetyDecision value) {
        return value.decision() != MedicationSafetyDecision.Status.PASS || !value.findings().isEmpty()
                || !value.failureCodes().isEmpty()
                || (!"SHADOW".equalsIgnoreCase(value.mode()) && value.evaluationId() == null);
    }

    /** 评价/发现 ID 与规则集标签每次重新生成；只比较临床输入与展示结果，处方或结果变化后须重新确认。 */
    private String reviewKey(List<MedicationSafetyDecision> reviews) {
        var canonical = reviews.stream().sorted(Comparator.comparing(MedicationSafetyDecision::prescriptionId))
                .map(review -> List.of(String.valueOf(review.prescriptionId()), String.valueOf(review.inputHash()),
                        String.valueOf(review.mode()), String.valueOf(review.decision()), review.failureCodes(),
                        String.valueOf(review.evaluationId() != null),
                        review.findings().stream().map(finding -> List.of(String.valueOf(finding.ruleCode()),
                                String.valueOf(finding.decision()), String.valueOf(finding.severity()),
                                String.valueOf(finding.message()), finding.medicationRequestIds().toString())).toList()))
                .toList();
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(json.write(canonical).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
