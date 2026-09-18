package com.rhn.quality.medication.api;

import com.rhn.platform.masterdata.api.MedicationKnowledgeDirectory.Knowledge;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public final class MedicationWorkbenchContracts {
    private MedicationWorkbenchContracts() {}
    public record RuleSpec(String template, String name, String explanation, int duplicateCount,
                           String message, String decision, String ruleExpression, String categoryName,
                           Integer minAge, Integer maxAge) {
        public RuleSpec(String template, String name, String explanation, int duplicateCount, String message, String decision) {
            this(template, name, explanation, duplicateCount, message, decision, null, null, null, null);
        }
        public String effectiveExpression() {
            if (ruleExpression != null && !ruleExpression.isBlank()) return ruleExpression;
            return switch (template != null ? template : "") {
                case "AGE_CONTRAINDICATION" -> "IF Patient.Age < " + (minAge != null ? minAge : 18) + (categoryName != null ? " AND Medication.Category == '" + categoryName + "'" : "") + " THEN " + decision;
                case "CATEGORY_DUPLICATE" -> "IF Prescription.Count(Medication.Category == '" + (categoryName != null ? categoryName : "同类药品") + "') >= " + duplicateCount + " THEN " + decision;
                case "ANTIMICROBIAL_MAX_DAYS" -> "IF Medication.IsAntimicrobial == true AND Prescription.DurationDays > AntimicrobialMaxDays THEN " + decision;
                default -> "IF Prescription.Count(Medication.Id) >= " + duplicateCount + " THEN " + decision;
            };
        }
    }
    public record AiReply(String status, String message, RuleSpec rule) {}
    public record Candidate(Long id, Long parentId, int version, String requirement, String source,
                            String model, Instant createdAt, RuleSpec rule, List<Knowledge> medications,
                            String status) {}
    public record Generation(String status, String message, Candidate candidate) {}
    public record GenerateRequest(String requirement, String source, List<Long> medicationIds, Long parentId) {
        public GenerateRequest(String requirement, String source, Long parentId) {
            this(requirement, source, List.of(), parentId);
        }
    }
    public record PatientSimulationContext(Integer patientAgeYears, String gender, List<String> activeAllergies) {
        public PatientSimulationContext {
            activeAllergies = activeAllergies == null ? List.of() : List.copyOf(activeAllergies);
        }
    }
    public record TrialItem(Long medicationId, String status, BigDecimal durationDays, String routeCode, String frequencyCode) {
        public TrialItem(Long medicationId, String status, BigDecimal durationDays, String routeCode) {
            this(medicationId, status, durationDays, routeCode, null);
        }
    }
    public record TrialRequest(List<TrialItem> items, PatientSimulationContext patientContext) {
        public TrialRequest(List<TrialItem> items) {
            this(items, null);
        }
    }
    public record CaseResult(String name, String expected, String actual, boolean passed,
                             List<Integer> matchedRows, List<String> reasons, List<TrialItem> input) {}
    public record TrialRun(Long id, Long candidateId, String mode, Instant createdAt,
                           Long prescriptionId, String inputHash, List<CaseResult> cases) {}
    public record ActiveRuleTrialRequest(List<String> ruleCodes, List<TrialItem> items,
                                         PatientSimulationContext patientContext) {
        public ActiveRuleTrialRequest {
            ruleCodes = ruleCodes == null ? List.of() : List.copyOf(ruleCodes);
            items = items == null ? List.of() : List.copyOf(items);
        }
    }
    public record ActiveRuleTrialCase(String ruleCode, String ruleName, int version,
                                      String outcome, String failureCode, String decision,
                                      List<Integer> matchedRows, List<String> reasons) {}
    public record ActiveRuleTrialRun(String mode, String scope, Instant createdAt,
                                     String ruleSetVersion, String decision,
                                     List<ActiveRuleTrialCase> cases) {}
    public record ShadowRequest(Long encounterId, Long prescriptionId) {}
    public record PrescriptionPreview(
            Long encounterId, Long prescriptionId, Long residentId, Long departmentId,
            String prescriptionStatus, PatientSimulationContext patientContext,
            List<PrescriptionPreviewItem> items) {}
    public record PrescriptionPreviewItem(
            Long medicationId, String status, BigDecimal durationDays, String routeCode,
            String frequencyCode, String medicationName, String preparationSpec,
            boolean historicalSnapshotAvailable) {}
    public record ActiveRuleView(Long ruleId, Long ruleVersionId, String ruleCode, String category,
                                 String ruleName, int version, String ruleSetVersion, String implementation,
                                 String status, String severity, String decision, String overridePolicy,
                                 Instant effectiveFrom, Instant effectiveTo,
                                 List<com.rhn.outpatient.api.MedicationSafetyDecision.Evidence> evidence) {}
    public record EvaluationSummary(Long evaluationId, Long prescriptionId, Long encounterId, Long residentId,
                                    Long organizationId, Long departmentId, String ruleSetVersion, String mode,
                                    String decision, Instant completedAt, int findingCount) {}
}
