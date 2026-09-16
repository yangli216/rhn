package com.rhn.outpatient.ordering;

import com.rhn.outpatient.api.*;
import org.springframework.web.bind.annotation.*;
import static com.rhn.shared.api.BusinessErrors.notFound;

/** Optional observation endpoint. Never submits an order, reserves stock, or creates an approval gate. */
@RestController
@RequestMapping("/api/encounters/{encounterId}/prescriptions/{prescriptionId}/safety-evaluations")
class PrescriptionSafetyController {
    private final PrescriptionSafetyEvaluationDirectory evaluations;
    private final PrescriptionSafetySnapshotDirectory snapshots;
    private final MedicationSafetyPort safety;
    PrescriptionSafetyController(PrescriptionSafetyEvaluationDirectory evaluations,
                                 PrescriptionSafetySnapshotDirectory snapshots, MedicationSafetyPort safety) {
        this.evaluations = evaluations; this.snapshots = snapshots; this.safety = safety;
    }

    @PostMapping
    MedicationSafetyDecision evaluate(@PathVariable Long encounterId, @PathVariable Long prescriptionId) {
        return evaluations.evaluateShadow(encounterId, prescriptionId);
    }

    @GetMapping("/{evaluationId}")
    MedicationSafetyDecision find(@PathVariable Long encounterId, @PathVariable Long prescriptionId,
                                  @PathVariable Long evaluationId) {
        snapshots.requireSnapshot(encounterId, prescriptionId);
        return safety.find(prescriptionId, evaluationId)
                .orElseThrow(() -> notFound("MEDICATION_EVALUATION_NOT_FOUND", "未找到当前处方的用药评价记录"));
    }
}
