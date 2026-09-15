package com.rhn.quality.medication.domain;

import com.rhn.outpatient.api.MedicationSafetyDecision;
import com.rhn.outpatient.api.PrescriptionSafetySnapshot;
import java.time.Instant;
import java.util.List;

public record MedicationSafetyEvaluation(Long id, Long actorId, PrescriptionSafetySnapshot input,
        String inputHash, Instant startedAt, Instant completedAt, MedicationSafetyDecision decision,
        List<MedicationSafetyFinding> findings) {
    public MedicationSafetyEvaluation {
        findings = List.copyOf(findings);
    }
}
