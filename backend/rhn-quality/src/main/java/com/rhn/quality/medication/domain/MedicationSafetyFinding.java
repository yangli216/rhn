package com.rhn.quality.medication.domain;

import com.rhn.outpatient.api.MedicationSafetyDecision;
import java.util.List;

public record MedicationSafetyFinding(Long id, RuleVersion rule, String message,
                                      List<Long> medicationRequestIds, String suggestedAction) {
    public MedicationSafetyFinding {
        medicationRequestIds = List.copyOf(medicationRequestIds);
    }

    public MedicationSafetyDecision.Finding snapshot() {
        return new MedicationSafetyDecision.Finding(id, rule.definition().code(), rule.version(),
                rule.definition().category(), rule.severity(), rule.decision(), message,
                medicationRequestIds, rule.evidence(), rule.overridePolicy(), suggestedAction);
    }
}
