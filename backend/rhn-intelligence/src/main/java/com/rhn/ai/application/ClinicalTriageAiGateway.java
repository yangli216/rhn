package com.rhn.ai.application;

import java.math.BigDecimal;
import java.util.List;

/** Provider-neutral, read-only model boundary for pre-triage assessment. */
public interface ClinicalTriageAiGateway {
    Result assess(Request request, ClinicalAssistantSettings runtimeSettings);

    record Request(String chiefComplaint, String symptoms, Integer age, String gender,
                   BigDecimal temperature, BigDecimal pulseRate, BigDecimal respiratoryRate,
                   BigDecimal systolic, BigDecimal diastolic, BigDecimal oxygenSaturation,
                   BigDecimal bloodGlucose, Integer painScore, String consciousness,
                   String ruleLevel, List<String> ruleReasons, List<CandidateDepartment> candidateDepartments) { }

    record CandidateDepartment(Long departmentId, String departmentName, int availableSlotCount,
                               boolean scheduledToday) { }

    record Result(String suggestedLevel, String summary, List<String> dangerSigns,
                  List<DepartmentRank> departmentRanks) { }

    record DepartmentRank(Long departmentId, Integer score, String rationale, String alertNotice) { }
}
