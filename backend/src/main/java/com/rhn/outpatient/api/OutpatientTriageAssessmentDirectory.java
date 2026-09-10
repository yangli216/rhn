package com.rhn.outpatient.api;

import java.math.BigDecimal;
import java.util.List;

/** Deterministic triage baseline and real routing candidates exposed to optional AI enhancement. */
public interface OutpatientTriageAssessmentDirectory {
    BaselineAssessment assess(BaselineInput input);
    RuleAssessment assessRules(BaselineInput input);

    record BaselineInput(String chiefComplaint, String symptoms, BigDecimal temperature, BigDecimal pulseRate,
                         BigDecimal respiratoryRate, BigDecimal systolic, BigDecimal diastolic,
                         BigDecimal oxygenSaturation, BigDecimal bloodGlucose, Integer painScore,
                         String consciousness, Integer age, String gender) { }

    record RuleAssessment(String level, String summary, List<String> reasons, List<String> dangerSigns) { }

    record DepartmentRecommendation(Long departmentId, String departmentName, int score, String rationale,
                                    int availableSlotCount, String alertNotice, boolean scheduledToday) { }

    record CandidateDepartment(Long departmentId, String departmentName, int availableSlotCount,
                               boolean scheduledToday) { }

    record BaselineAssessment(RuleAssessment rule, List<DepartmentRecommendation> departmentRecommendations,
                              List<CandidateDepartment> candidateDepartments) { }
}
