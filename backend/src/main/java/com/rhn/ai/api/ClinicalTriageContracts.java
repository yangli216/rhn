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
                                     String fallbackReason) { }
}
