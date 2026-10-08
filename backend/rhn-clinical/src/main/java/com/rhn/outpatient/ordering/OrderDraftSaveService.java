package com.rhn.outpatient.ordering;

import com.rhn.outpatient.api.EncounterDirectory;
import com.rhn.platform.idempotency.IdempotencyService;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.ArrayList;
import java.util.List;
import static com.rhn.shared.api.BusinessErrors.badRequest;

/** One transaction for all order drafts. A retried command returns its committed receipt. */
@Service
class OrderDraftSaveService {
    private static final String OPERATION = "OUTPATIENT_ORDER_DRAFT_SAVE";
    private final EncounterDirectory encounters;
    private final PrescriptionService prescriptions;
    private final ServiceRequestService services;
    private final IdempotencyService idempotency;
    private final ExecutionContextProvider contexts;
    private final JsonCodec json;

    OrderDraftSaveService(EncounterDirectory encounters, PrescriptionService prescriptions, ServiceRequestService services,
                          IdempotencyService idempotency, ExecutionContextProvider contexts, JsonCodec json) {
        this.encounters = encounters; this.prescriptions = prescriptions; this.services = services;
        this.idempotency = idempotency; this.contexts = contexts; this.json = json;
    }

    private record CanonicalCommand(Long encounterId, Long subjectId, OrderDraftSaveRequest request) {}

    @Transactional
    OrderDraftSaveResponse save(Long encounterId, OrderDraftSaveRequest input) {
        encounters.requireActiveForOrdering(encounterId); // Re-check access and state even on replay.
        if (input.medicationItems().isEmpty() && input.serviceItems().isEmpty()) {
            throw badRequest("ORDER_DRAFT_EMPTY", "没有需要保存的医嘱草稿");
        }
        var context = contexts.requireCurrent();
        String canonical = json.write(new CanonicalCommand(encounterId, context.subjectId(), input));
        var reservation = idempotency.reserve(OPERATION, input.commandCode(), canonical);
        if (reservation.replay()) return json.read(reservation.responseJson(), OrderDraftSaveResponse.class);
        List<PrescriptionResponse> savedPrescriptions = input.medicationItems().isEmpty() ? List.of()
                : prescriptions.batchOrder(encounterId, new BatchOrderPrescriptionRequest(input.medicationItems(), false));
        List<ServiceRequestResponse> savedServices = new ArrayList<>();
        for (var item : input.serviceItems()) savedServices.add(services.create(encounterId, item));
        var receipt = new OrderDraftSaveResponse(input.commandCode(), encounterId, savedPrescriptions, List.copyOf(savedServices));
        idempotency.complete(OPERATION, input.commandCode(), "Encounter", encounterId, 200, json.write(receipt));
        return receipt;
    }
}
