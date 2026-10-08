package com.rhn.ai.application;

import com.rhn.outpatient.api.OutpatientPlanTemplateDirectory;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertNull;

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
    void unrelated_and_empty_queries_do_not_fill_candidates_with_popular_plans() {
        var popular = plan(1L, "常用上感方案", 999999, "J06.9", "急性上呼吸道感染");
        assertTrue(service.retrieve(List.of(popular), new ClinicalPlanRetrievalService.Query("踝关节扭伤", null), 20).isEmpty());
        assertTrue(service.retrieve(List.of(popular), new ClinicalPlanRetrievalService.Query("", null), 20).isEmpty());
    }

    @Test
    void clinical_relevance_precedes_personal_scope_and_usage() {
        var personal = new OutpatientPlanTemplateDirectory.PlanTemplateSnapshot(1L, 0, "PERSONAL", "MANUAL", null,
                "其他方案", "咳嗽", 99999999, List.of(), List.of(), List.of(), List.of());
        var department = new OutpatientPlanTemplateDirectory.PlanTemplateSnapshot(2L, 0, "DEPARTMENT", "MANUAL", null,
                "其他方案", null, 0, List.of(), List.of(), List.of(), List.of(
                new com.rhn.outpatient.api.OutpatientPlanTemplateContracts.PlanTaskInput("CONDITION", "咳嗽", null, "EXPLICIT", "MATCHED", null),
                new com.rhn.outpatient.api.OutpatientPlanTemplateContracts.PlanTaskInput("CONDITION", "发热", null, "EXPLICIT", "MATCHED", null)));
        var result = service.retrieve(List.of(personal, department), new ClinicalPlanRetrievalService.Query("咳嗽发热", "PERSONAL"), 20);
        assertEquals(2L, result.getFirst().plan().id());
    }

    @Test
    void index_terms_recall_a_changed_duration_and_identical_content_is_deduplicated() {
        var profile = new com.rhn.outpatient.api.PlanSearchProfile(1, "same-clinical-content", "咳嗽病历",
                List.of("咳嗽3天"), List.of(), List.of(), null, null);
        var personal = new OutpatientPlanTemplateDirectory.PlanTemplateSnapshot(1L, 0, "PERSONAL", "MANUAL", null,
                "个人常用", null, 0, List.of(), List.of(), List.of(), List.of(), profile);
        var department = new OutpatientPlanTemplateDirectory.PlanTemplateSnapshot(2L, 0, "DEPARTMENT", "MANUAL", null,
                "科室常用", null, 99999, List.of(), List.of(), List.of(), List.of(), profile);
        var result = service.retrieve(List.of(department, personal), new ClinicalPlanRetrievalService.Query("咳嗽5天", null), 20);
        assertEquals(List.of(1L), result.stream().map(match -> match.plan().id()).toList());
        assertTrue(result.getFirst().evidence().stream().anyMatch(value -> value.startsWith("INDEX_TERMS:")));
    }

    @Test
    void ordering_is_stable_when_scores_and_usage_are_equal() {
        var firstRun = service.retrieve(List.of(plan(9L, "感冒复诊", 0, "J00", "感冒"),
                        plan(3L, "感冒复诊", 0, "J00", "感冒")),
                new ClinicalPlanRetrievalService.Query("感冒复诊", "PERSONAL"), 20);
        assertEquals(List.of(3L, 9L), firstRun.stream().map(match -> match.plan().id()).toList());
    }

    static java.util.stream.Stream<org.junit.jupiter.params.provider.Arguments> incompleteIdentities() {
        return java.util.stream.Stream.of(
                org.junit.jupiter.params.provider.Arguments.of(null, null, "I10"),
                org.junit.jupiter.params.provider.Arguments.of(null, "WESTERN_MEDICINE", "I10"),
                org.junit.jupiter.params.provider.Arguments.of("WHO.BD.CS.ICD10", null, "I10"),
                org.junit.jupiter.params.provider.Arguments.of(" ", "WESTERN_MEDICINE", "I10"),
                org.junit.jupiter.params.provider.Arguments.of("WHO.BD.CS.ICD10", " ", "I10"),
                org.junit.jupiter.params.provider.Arguments.of("WHO.BD.CS.ICD10", "UNKNOWN", "I10"),
                org.junit.jupiter.params.provider.Arguments.of("WHO.BD.CS.ICD10", "WESTERN_MEDICINE", " "));
    }

    @org.junit.jupiter.params.ParameterizedTest @org.junit.jupiter.params.provider.MethodSource("incompleteIdentities")
    void incompleteQueryIdentityCannotClaimExactCodeButCanStillMatchRealText(String system, String domain, String code) {
        var plan = plan(1L, "方案", 0, "I10", "原发性高血压");
        var identity = new ClinicalPlanRetrievalService.DiagnosisIdentity(system, domain, code);
        assertTrue(service.retrieve(List.of(plan), new ClinicalPlanRetrievalService.Query("", List.of(identity), null), 20).isEmpty());
        var textOnly = service.retrieve(List.of(plan), new ClinicalPlanRetrievalService.Query("原发性高血压", List.of(identity), null), 20).getFirst();
        assertEquals(35, textOnly.clinicalScore());
        assertTrue(textOnly.evidence().contains("DIAGNOSIS_TEXT:原发性高血压"));
        assertTrue(textOnly.evidence().stream().noneMatch(value -> value.startsWith("DIAGNOSIS_CODE:")));
    }

    @Test void twoUnknownIdentitiesAreNotAnExactMatchAndLegacyPlanSnapshotsRemainUnknown() {
        var diagnosis = new OutpatientPlanTemplateDirectory.DiagnosisSnapshot("I10", "诊断", "PRIMARY");
        assertNull(diagnosis.codeSystem()); assertNull(diagnosis.diagnosisDomain());
        var plan = new OutpatientPlanTemplateDirectory.PlanTemplateSnapshot(1L, 0, "PERSONAL", "MANUAL", null,
                "方案", null, 0, List.of(diagnosis), List.of(), List.of(), List.of());
        var query = new ClinicalPlanRetrievalService.Query("", List.of(new ClinicalPlanRetrievalService.DiagnosisIdentity(null, null, "I10")), null);
        assertTrue(service.retrieve(List.of(plan), query, 20).isEmpty());
    }

    @Test void identicalCodesInDifferentSystemsAndDomainsDoNotCrossMatch() {
        var western = plan(1L, "西医方案", 0, "I10", "西医名称");
        var tcm = new OutpatientPlanTemplateDirectory.PlanTemplateSnapshot(2L, 0, "PERSONAL", "MANUAL", null,
                "中医方案", null, 0, List.of(new OutpatientPlanTemplateDirectory.DiagnosisSnapshot(
                "RHN.BD.CS.TCM_DISEASE", "TCM_DISEASE", "I10", "中医名称", "PRIMARY")), List.of(), List.of(), List.of());
        var query = new ClinicalPlanRetrievalService.Query("", List.of(new ClinicalPlanRetrievalService.DiagnosisIdentity(
                " RHN.BD.CS.TCM_DISEASE ", "TCM_DISEASE", "i10")), null);
        var matches = service.retrieve(List.of(western, tcm), query, 20);
        assertEquals(List.of(2L), matches.stream().map(value -> value.plan().id()).toList());
        assertTrue(matches.getFirst().evidence().contains("DIAGNOSIS_CODE:RHN.BD.CS.TCM_DISEASE|TCM_DISEASE|I10"));
        assertTrue(matches.getFirst().evidence().contains("SCOPE:PERSONAL"));
    }

    @Test void unavailablePlanDirectoryCannotBeReportedAsNoMatchingPlans() {
        assertThrows(NullPointerException.class, () -> service.retrieve(null, new ClinicalPlanRetrievalService.Query("", null), 20));
    }

    private OutpatientPlanTemplateDirectory.PlanTemplateSnapshot plan(Long id, String name, long useCount,
                                                                       String code, String display) {
        return new OutpatientPlanTemplateDirectory.PlanTemplateSnapshot(id, 0, "PERSONAL", "MANUAL", null,
                name, null, useCount, List.of(new OutpatientPlanTemplateDirectory.DiagnosisSnapshot(
                "WHO.BD.CS.ICD10", "WESTERN_MEDICINE", code, display, "PRIMARY")),
                List.of(), List.of(), List.of());
    }
}
