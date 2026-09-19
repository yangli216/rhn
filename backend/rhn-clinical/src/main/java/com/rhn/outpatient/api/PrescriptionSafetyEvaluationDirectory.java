package com.rhn.outpatient.api;

/** Evaluates a prescription against the active medication-safety rule set and records the decision. */
public interface PrescriptionSafetyEvaluationDirectory {
    MedicationSafetyDecision evaluateShadow(Long encounterId, Long prescriptionId);
}
