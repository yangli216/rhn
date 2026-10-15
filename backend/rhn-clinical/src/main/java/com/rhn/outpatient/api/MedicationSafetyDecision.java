package com.rhn.outpatient.api;

import com.rhn.platform.dictionary.api.DictionaryBinding;

import java.util.List;

/** A missing evaluationId means the result could not be durably recorded. SHADOW is never a safety clearance. */
public record MedicationSafetyDecision(
        Long evaluationId, Long prescriptionId, long prescriptionRevision, String inputHash,
        String ruleSetVersion, String engineVersion, String mode, @DictionaryBinding("MED_SAFETY_DECISION") Status decision,
        List<Finding> findings, List<RuleExecution> ruleExecutions, List<String> failureCodes) {
    public MedicationSafetyDecision {
        findings = List.copyOf(findings);
        ruleExecutions = List.copyOf(ruleExecutions);
        failureCodes = List.copyOf(failureCodes);
    }

    public enum Status { PASS, WARN, REQUIRE_OVERRIDE, BLOCK, UNAVAILABLE }
    public enum Severity { INFO, LOW, MODERATE, HIGH, CRITICAL }
    public enum OverridePolicy { NOT_ALLOWED, ACKNOWLEDGE, REASON_REQUIRED }

    public record Evidence(String sourceType, String sourceTitle, String sourceVersion,
                           String sourceLocator, String section, String excerpt, String usageScope) {}

    public record Finding(Long findingId, String ruleCode, int ruleVersion, String category,
                          Severity severity, @DictionaryBinding("MED_SAFETY_DECISION") Status decision, String message,
                          List<Long> medicationRequestIds,
                          List<Evidence> evidence, @DictionaryBinding("MED_SAFETY_OVERRIDE_POLICY") OverridePolicy overridePolicy,
                          String suggestedAction) {
        public Finding {
            medicationRequestIds = List.copyOf(medicationRequestIds);
            evidence = List.copyOf(evidence);
        }
    }

    public record RuleExecution(String ruleCode, int ruleVersion, String outcome, String failureCode) {}
}
