package com.rhn.outpatient.api;

import java.time.Instant;
import java.util.List;

/** Submission-time clinical context shown alongside the existing pharmacist review workflow. */
public interface PrescriptionSafetyReviewDirectory {
    Review forMedicationRequest(Long requestId);

    record Medication(Long requestId, String name) {}
    record Review(Long prescriptionId, String prescriptionNo, Instant submittedAt,
                  String doctorReason, MedicationSafetyDecision evaluation, List<Medication> medications) {}
}
