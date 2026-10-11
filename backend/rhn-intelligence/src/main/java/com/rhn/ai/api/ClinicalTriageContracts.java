package com.rhn.ai.api;

import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.List;

public final class ClinicalTriageContracts {
    private ClinicalTriageContracts() { }

    public record AssessmentRequest(
            @Size(max = 1000) String chiefComplaint,
            @Size(max = 1000) String symptoms,
            BigDecimal temperature,
            BigDecimal pulseRate,
            BigDecimal respiratoryRate,
            BigDecimal systolic,
            BigDecimal diastolic,
            BigDecimal oxygenSaturation,
            BigDecimal bloodGlucose,
            Integer painScore,
            String consciousness,
            Integer age,
            String gender,
            Boolean aiEnhancement
    ) { }

    public record DepartmentRecommendation(Long departmentId, String departmentName, int score, String rationale,
                                           int availableScheduleCount, String alertNotice, String source,
                                           boolean scheduledToday) { }

    public record AssessmentResponse(String ruleLevel, String suggestedLevel, String source, String aiMode,
                                     boolean aiApplied, String summary, List<String> ruleReasons,
                                     List<String> dangerSigns,
                                     List<DepartmentRecommendation> departmentRecommendations,
                                     String fallbackReason, DecisionMode decisionMode) { }

    public enum DecisionMode { DISABLED, SHADOW, ASSIST }
    public enum DecisionStatus { DISABLED, SHADOW, ASSIST, UNCERTAIN, NO_INPUT, CONFIGURATION_INCOMPLETE, CANDIDATE_LIMIT, FAILED }
    public enum SupplementTopic { ONSET, COURSE, ASSOCIATED_SYMPTOMS, HISTORY }

    public record DecisionDepartment(Long departmentId, String departmentName, int availableScheduleCount,
                                     boolean scheduledToday, double confidence, double probability) { }
    public record SupplementPrompt(SupplementTopic topic, String message, double confidence) { }
    public record DecisionAssessment(DecisionMode mode, DecisionStatus status, DecisionDepartment department,
                                     List<SupplementPrompt> supplements, String message, String traceId,
                                     String model, String version, String inputHash, Integer latencyMs,
                                     Double minConfidence) { }
}
