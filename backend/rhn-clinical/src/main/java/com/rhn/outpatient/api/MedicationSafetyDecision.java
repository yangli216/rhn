package com.rhn.outpatient.api;

import java.util.List;

/** A missing evaluationId means the result could not be durably recorded. SHADOW is never a safety clearance. */
public record MedicationSafetyDecision(
        Long evaluationId, Long prescriptionId, long prescriptionRevision, String inputHash,
        String ruleSetVersion, String engineVersion, String mode, Status decision,
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
                          Severity severity, Status decision, String message, List<Long> medicationRequestIds,
                          List<Evidence> evidence, OverridePolicy overridePolicy, String suggestedAction) {
        public Finding {
            medicationRequestIds = List.copyOf(medicationRequestIds);
            evidence = List.copyOf(evidence);
        }
    }

    public record RuleExecution(String ruleCode, int ruleVersion, String outcome, String failureCode) {}
}
