package com.rhn.outpatient.ordering;

import com.rhn.outpatient.api.MedicationRequestDirectory;
import com.rhn.outpatient.api.PrescriptionSafetyReviewDirectory;
import com.rhn.shared.json.JsonCodec;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
class PrescriptionSafetyReviewService implements PrescriptionSafetyReviewDirectory {
    private final MedicationRequestDirectory requests;
    private final PrescriptionRepository prescriptions;
    private final JsonCodec json;

    PrescriptionSafetyReviewService(MedicationRequestDirectory requests, PrescriptionRepository prescriptions, JsonCodec json) {
        this.requests = requests; this.prescriptions = prescriptions; this.json = json;
    }

    @Override
    @Transactional(readOnly = true)
    public Review forMedicationRequest(Long requestId) {
        var request = requests.requireForPharmacy(requestId);
        if (request.prescriptionId() == null) return null;
        var prescription = prescriptions.findByIdAndTenantId(request.prescriptionId(), request.tenantId())
                .orElseThrow(() -> notFound("PRESCRIPTION_NOT_FOUND", "未找到药品所属处方"));
        return prescription.safetyReviewJson() == null ? null : json.read(prescription.safetyReviewJson(), Review.class);
    }
}
