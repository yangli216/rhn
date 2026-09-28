package com.rhn.ai.application;

import com.rhn.outpatient.api.OutpatientPlanTemplateDirectory;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ClinicalPlanRetrievalServiceTest {
    private final ClinicalPlanRetrievalService service = new ClinicalPlanRetrievalService();

    @Test
    void exact_diagnosis_outranks_popular_unrelated_plan_and_exposes_evidence() {
        var lowFrequencyExact = plan(2L, "低频高血压方案", 0, "I10", "原发性高血压");
        var popularUnrelated = plan(1L, "常用上感方案", 9999, "J06.9", "急性上呼吸道感染");

        var matches = service.retrieve(List.of(popularUnrelated, lowFrequencyExact),
                new ClinicalPlanRetrievalService.Query("复诊", List.of(
                        new ClinicalPlanRetrievalService.DiagnosisIdentity(
                                "WHO.BD.CS.ICD10", "WESTERN_MEDICINE", "I10")), null), 20);

        assertEquals(2L, matches.getFirst().plan().id());
        assertTrue(matches.getFirst().evidence().stream().anyMatch(value -> value.startsWith("DIAGNOSIS_CODE:")));
    }

    @Test
    void ordering_is_stable_when_scores_and_usage_are_equal() {
        var firstRun = service.retrieve(List.of(plan(9L, "感冒复诊", 0, "J00", "感冒"),
                        plan(3L, "感冒复诊", 0, "J00", "感冒")),
                new ClinicalPlanRetrievalService.Query("感冒复诊", "PERSONAL"), 20);
        assertEquals(List.of(3L, 9L), firstRun.stream().map(match -> match.plan().id()).toList());
    }

    private OutpatientPlanTemplateDirectory.PlanTemplateSnapshot plan(Long id, String name, long useCount,
                                                                       String code, String display) {
        return new OutpatientPlanTemplateDirectory.PlanTemplateSnapshot(id, 0, "PERSONAL", "MANUAL", null,
                name, null, useCount, List.of(new OutpatientPlanTemplateDirectory.DiagnosisSnapshot(
                "WHO.BD.CS.ICD10", "WESTERN_MEDICINE", code, display, "PRIMARY")),
                List.of(), List.of(), List.of());
    }
}
