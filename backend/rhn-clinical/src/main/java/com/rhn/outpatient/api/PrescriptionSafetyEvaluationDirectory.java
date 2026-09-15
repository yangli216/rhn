package com.rhn.outpatient.api;

/** Internal, explicitly invoked SHADOW workflow; not wired to prescribing or exposed as an HTTP submit gate. */
public interface PrescriptionSafetyEvaluationDirectory {
    MedicationSafetyDecision evaluateShadow(Long encounterId, Long prescriptionId);
}
