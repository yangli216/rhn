package com.rhn.outpatient.ordering;

import com.rhn.outpatient.api.EncounterDirectory;
import com.rhn.platform.idempotency.IdempotencyService;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;
import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;

/**
 * One transaction for all order drafts. A retried command returns its committed receipt.
 * 医生“修改”在原医嘱上进行：已签署且未进结算单的先退回未签署再改，与新草稿同一事务；简单模式随后立即签署。
 */
@Service
class OrderDraftSaveService {
    private static final String OPERATION = "OUTPATIENT_ORDER_DRAFT_SAVE";
    private final EncounterDirectory encounters;
    private final PrescriptionService prescriptions;
    private final MedicationRequestService medications;
    private final ServiceRequestService services;
    private final IdempotencyService idempotency;
    private final ExecutionContextProvider contexts;
    private final JsonCodec json;

    OrderDraftSaveService(EncounterDirectory encounters, PrescriptionService prescriptions, MedicationRequestService medications,
                          ServiceRequestService services, IdempotencyService idempotency, ExecutionContextProvider contexts,
                          JsonCodec json) {
        this.encounters = encounters; this.prescriptions = prescriptions; this.medications = medications; this.services = services;
        this.idempotency = idempotency; this.contexts = contexts; this.json = json;
    }

    private static void requireRevision(long actual, long expected) {
        if (actual != expected) throw conflict("ORDER_REVISION_CONFLICT", "医嘱已被其他用户修改，请刷新后重新修改");
    }

    private record CanonicalCommand(Long encounterId, Long subjectId, OrderDraftSaveRequest request) {}

    @Transactional
    OrderDraftSaveResponse save(Long encounterId, OrderDraftSaveRequest input) {
        encounters.requireActiveForOrdering(encounterId); // Re-check access and state even on replay.
        if (input.medicationItems().isEmpty() && input.serviceItems().isEmpty() && input.revisions().isEmpty()) {
            throw badRequest("ORDER_DRAFT_EMPTY", "没有需要保存的医嘱草稿");
        }
        var context = contexts.requireCurrent();
        String canonical = json.write(new CanonicalCommand(encounterId, context.subjectId(), input));
        var reservation = idempotency.reserve(OPERATION, input.commandCode(), canonical);
        if (reservation.replay()) return json.read(reservation.responseJson(), OrderDraftSaveResponse.class);
        if (input.revisions().stream().map(value -> value.kind() + ":" + value.id()).distinct().count()
                != input.revisions().size()) {
            throw badRequest("ORDER_DRAFT_REVISION_DUPLICATE", "同一医嘱不能重复修改");
        }
        var encounter = encounters.lockActiveForOrdering(encounterId);
        List<MedicationRequestResponse> revisedMedications = new java.util.ArrayList<>();
        List<ServiceRequestResponse> revisedServices = new java.util.ArrayList<>();
        for (var revision : input.revisions()) {
            if (revision.kind() == OrderDraftSaveRequest.RevisedOrder.Kind.MEDICATION) {
                if (revision.medication() == null) throw badRequest("ORDER_DRAFT_REVISION_INVALID", "药品修改缺少内容");
                var value = medications.requireOwned(encounter.tenantId(), encounterId, revision.id());
                requireRevision(value.revision(), revision.expectedRevision());
                // 签署以处方为单位：已签署药品先整张处方退回未签署，同方其余药品随下一次签署重新生效。
                if (value.status() == MedicationRequestStatus.ACTIVE) {
                    prescriptions.withdrawSignature(encounterId, value.requestGroupId(),
                            prescriptions.currentRevision(encounter.tenantId(), value.requestGroupId()));
                }
                revisedMedications.add(medications.reviseDraft(encounter, value, value.revision(), revision.medication()));
            } else {
                if (revision.service() == null) throw badRequest("ORDER_DRAFT_REVISION_INVALID", "诊疗项目修改缺少内容");
                var value = services.requireOwned(encounter.tenantId(), encounterId, revision.id());
                requireRevision(value.revision(), revision.expectedRevision());
                if (value.status() == ServiceRequestStatus.ACTIVE) {
                    services.withdrawSignature(encounterId, value.id(), value.revision());
                }
                revisedServices.add(services.reviseDraft(value, value.revision(), revision.service()));
            }
        }
        List<PrescriptionResponse> savedPrescriptions = input.medicationItems().isEmpty() ? List.of()
                : prescriptions.batchOrder(encounterId, new BatchOrderPrescriptionRequest(input.medicationItems(), false));
        List<ServiceRequestResponse> savedServices = input.serviceItems().isEmpty() ? List.of()
                : services.createDrafts(encounterId, input.serviceItems());
        var receipt = new OrderDraftSaveResponse(input.commandCode(), encounterId, savedPrescriptions, savedServices,
                List.copyOf(revisedMedications), List.copyOf(revisedServices));
        idempotency.complete(OPERATION, input.commandCode(), "Encounter", encounterId, 200, json.write(receipt));
        return receipt;
    }
}
