package com.rhn.outpatient.ordering;

import com.rhn.outpatient.api.MedicationRequestDirectory;
import com.rhn.outpatient.api.PrescriptionSafetyReviewDirectory;
import com.rhn.shared.json.JsonCodec;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import static com.rhn.shared.api.BusinessErrors.notFound;

import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

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
        return review(prescription);
    }

    @Override
    @Transactional(readOnly = true)
    public Map<Long, Review> forMedicationRequests(Collection<Long> requestIds) {
        Map<Long, Review> result = new LinkedHashMap<>();
        List<Long> ids = requestIds == null ? List.of() : requestIds.stream().distinct().toList();
        if (ids.isEmpty()) return result;
        Map<Long, MedicationRequestDirectory.MedicationRequestSnapshot> snapshots = requests.pharmacySnapshots(ids);
        if (snapshots == null || snapshots.isEmpty()) return result;
        Long tenantId = snapshots.values().iterator().next().tenantId();
        Map<Long, Review> reviewByPrescription = new HashMap<>();
        Map<Long, Long> prescriptionIdByRequest = new LinkedHashMap<>();
        for (Long id : ids) {
            var request = snapshots.get(id);
            if (request == null) continue;
            prescriptionIdByRequest.put(id, request.prescriptionId());
        }
        List<Long> prescriptionIds = prescriptionIdByRequest.values().stream()
                .filter(java.util.Objects::nonNull).distinct().toList();
        if (!prescriptionIds.isEmpty()) {
            Map<Long, Prescription> prescriptionById = new HashMap<>();
            for (Prescription value : prescriptions.findByTenantIdAndIdIn(tenantId, prescriptionIds)) {
                prescriptionById.putIfAbsent(value.id(), value);
            }
            for (Long prescriptionId : prescriptionIds) {
                Prescription prescription = prescriptionById.get(prescriptionId);
                if (prescription == null) throw notFound("PRESCRIPTION_NOT_FOUND", "未找到药品所属处方");
                reviewByPrescription.put(prescriptionId, review(prescription));
            }
        }
        for (Map.Entry<Long, Long> entry : prescriptionIdByRequest.entrySet()) {
            Long prescriptionId = entry.getValue();
            result.put(entry.getKey(), prescriptionId == null ? null : reviewByPrescription.get(prescriptionId));
        }
        return result;
    }

    private Review review(Prescription prescription) {
        return prescription.safetyReviewJson() == null ? null : json.read(prescription.safetyReviewJson(), Review.class);
    }
}
