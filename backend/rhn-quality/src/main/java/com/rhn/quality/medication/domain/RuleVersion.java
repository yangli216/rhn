package com.rhn.quality.medication.domain;

import com.rhn.outpatient.api.MedicationSafetyDecision.Evidence;
import com.rhn.outpatient.api.MedicationSafetyDecision.OverridePolicy;
import com.rhn.outpatient.api.MedicationSafetyDecision.Severity;
import com.rhn.outpatient.api.MedicationSafetyDecision.Status;
import java.time.Instant;
import java.util.List;

/** Immutable, platform-owned executable metadata; there is no authoring/update API in QMED-1. */
public record RuleVersion(Long id, RuleDefinition definition, int version, String ruleSetVersion,
                          String implementationKey, String status, Severity severity, Status decision,
                          OverridePolicy overridePolicy, Instant effectiveFrom, Instant effectiveTo,
                          List<Evidence> evidence) {
    public RuleVersion {
        evidence = List.copyOf(evidence);
        if (version < 1 || evidence.isEmpty()) throw new IllegalArgumentException("Rule version requires evidence");
    }

    public boolean availableAt(Instant time) {
        return "SHADOW".equals(status) && !time.isBefore(effectiveFrom)
                && (effectiveTo == null || time.isBefore(effectiveTo));
    }
}
