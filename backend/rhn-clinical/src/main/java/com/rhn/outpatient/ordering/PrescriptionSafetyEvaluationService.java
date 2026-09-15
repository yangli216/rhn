package com.rhn.outpatient.ordering;

import com.rhn.outpatient.api.MedicationSafetyDecision;
import com.rhn.outpatient.api.MedicationSafetyPort;
import com.rhn.outpatient.api.PrescriptionSafetyEvaluationDirectory;
import com.rhn.outpatient.api.PrescriptionSafetyRequest;
import com.rhn.outpatient.api.PrescriptionSafetySnapshotDirectory;
import org.springframework.stereotype.Service;

@Service
class PrescriptionSafetyEvaluationService implements PrescriptionSafetyEvaluationDirectory {
    private final PrescriptionSafetySnapshotDirectory snapshots;
    private final MedicationSafetyPort safety;

    PrescriptionSafetyEvaluationService(PrescriptionSafetySnapshotDirectory snapshots, MedicationSafetyPort safety) {
        this.snapshots = snapshots; this.safety = safety;
    }

    @Override
    public MedicationSafetyDecision evaluateShadow(Long encounterId, Long prescriptionId) {
        return safety.evaluate(new PrescriptionSafetyRequest(snapshots.requireSnapshot(encounterId, prescriptionId)));
    }
}
