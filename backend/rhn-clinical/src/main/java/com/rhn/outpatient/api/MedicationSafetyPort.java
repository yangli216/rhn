package com.rhn.outpatient.api;

import java.util.Optional;

/** Caller-owned boundary. QMED-1 evaluations are advisory SHADOW results, never submit authorization. */
public interface MedicationSafetyPort {
    MedicationSafetyDecision evaluate(PrescriptionSafetyRequest request);

    Optional<MedicationSafetyDecision> find(Long prescriptionId, Long evaluationId);
}
