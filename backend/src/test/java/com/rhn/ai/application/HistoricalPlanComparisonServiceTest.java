package com.rhn.ai.application;

import com.rhn.ai.api.ClinicalAssistantContracts.HistoricalStablePlanView;
import com.rhn.outpatient.api.OutpatientPlanTemplateContracts.DiagnosisInput;
import com.rhn.outpatient.api.OutpatientPlanTemplateContracts.MedicationInput;
import com.rhn.outpatient.api.OutpatientPlanTemplateDirectory;
import com.rhn.platform.masterdata.api.MedicationSemanticDirectory;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class HistoricalPlanComparisonServiceTest {
    @Test
    void computes_deterministic_diagnosis_and_medication_differences() {
        HistoricalPlanResolutionService historicalPlans = mock(HistoricalPlanResolutionService.class);
        OutpatientPlanTemplateDirectory plans = mock(OutpatientPlanTemplateDirectory.class);
        MedicationSemanticDirectory semantics = mock(MedicationSemanticDirectory.class);
        ExecutionContextProvider contexts = mock(ExecutionContextProvider.class);
        when(contexts.requireCurrent()).thenReturn(new ExecutionContext(1L, 2L, "doctor", "corr", Set.of(),
                10L, 20L, "ASSIGNED", Set.of(10L), Set.of(20L), 30L));
        var historicalMedication = new MedicationInput(100L, 200L, 300L, "氨氯地平片", "5mg",
                new BigDecimal("5"), "mg", "ORAL", "QD", new BigDecimal("30"), "天",
                BigDecimal.ONE, "盒", false, false, null, "SALE", true, null);
        var historical = new HistoricalStablePlanView(9L, 8L, Instant.EPOCH, "高血压历史方案", "摘要",
                List.of(new DiagnosisInput("WHO.BD.CS.ICD10", "WESTERN_MEDICINE", "I10", "原发性高血压", "PRIMARY")),
                List.of(historicalMedication), List.of(), List.of(), List.of(), Set.of("DIAGNOSIS", "MEDICATION", "SERVICE"));
        when(historicalPlans.resolveHistoricalStablePlan(9L)).thenReturn(Optional.of(historical));
        var standardMedication = new OutpatientPlanTemplateDirectory.MedicationSnapshot(1L, 100L, 201L, 301L,
                "WESTERN", "MED-1", "氨氯地平片", "5mg", "氨氯地平片 5mg",
                new BigDecimal("10"), "mg", "ORAL", "QD", new BigDecimal("30"), "天",
                BigDecimal.ONE, "盒", null, true, false, "SALE", true, null);
        var standard = new OutpatientPlanTemplateDirectory.PlanTemplateSnapshot(7L, 0, "HOSPITAL", "MANUAL",
                null, "高血压标准方案", null, 1,
                List.of(new OutpatientPlanTemplateDirectory.DiagnosisSnapshot("WHO.BD.CS.ICD10",
                        "WESTERN_MEDICINE", "I10", "原发性高血压", "PRIMARY")),
                List.of(standardMedication), List.of(), List.of());
        when(plans.visibleForCurrentContext()).thenReturn(List.of(standard));

        var result = new HistoricalPlanComparisonService(historicalPlans, plans, semantics, contexts)
                .compare(9L, 7L);

        assertEquals(List.of("DIAGNOSIS", "MEDICATION"),
                result.differences().stream().map(value -> value.category()).toList());
        assertEquals("CONSISTENT", result.differences().getFirst().status());
        assertEquals("CONFLICT", result.differences().get(1).status());
        assertTrue(result.differences().get(1).reason().contains("剂量"));
    }
    @Test void ingredientLookupFailureIsNotAnEmptySuccessfulComparison() {
        var f = new Fixture();
        f.medications(medication(100L, BigDecimal.ONE), standardMedication(101L, BigDecimal.ONE));
        when(f.semantics.ingredientIds(1L, 100L)).thenThrow(new IllegalStateException("成分目录不可用"));
        org.junit.jupiter.api.Assertions.assertThrows(IllegalStateException.class, () -> f.service.compare(9L, 7L));
    }

    @Test void missingQuantitiesOnBothSidesAreUnconfirmedRatherThanConsistent() {
        var f = new Fixture();
        f.medications(medication(100L, null), standardMedication(100L, null));
        assertEquals("NEEDS_REVIEW", f.service.compare(9L, 7L).differences().getFirst().status());
    }

    @Test void absentMedicationIdentitiesNeverMatchEachOther() {
        var f = new Fixture();
        f.medications(medication(null, BigDecimal.ONE), standardMedication(null, BigDecimal.ONE));
        var result = f.service.compare(9L, 7L);
        assertEquals(2, result.differences().size());
        assertTrue(result.differences().stream().allMatch(value -> "NEEDS_REVIEW".equals(value.status())));
    }

    @Test void equalCompleteFactsAreConsistentWithoutIngredientLookup() {
        var f = new Fixture(); f.medications(medication(100L, BigDecimal.ONE), standardMedication(100L, BigDecimal.ONE));
        assertEquals("CONSISTENT", f.service.compare(9L, 7L).differences().getFirst().status());
        org.mockito.Mockito.verifyNoInteractions(f.semantics);
    }

    @Test void missingDiagnosisSystemIsNotInventedFromItsCode() {
        var f = new Fixture();
        f.plans(List.of(new DiagnosisInput("I10", "诊断", "PRIMARY")),
                List.of(new OutpatientPlanTemplateDirectory.DiagnosisSnapshot("I10", "诊断", "PRIMARY")),
                List.of(), List.of(), List.of(), List.of());
        var result = f.service.compare(9L, 7L);
        assertEquals(2, result.differences().size());
        assertTrue(result.differences().stream().allMatch(value -> "NEEDS_REVIEW".equals(value.status())));
    }

    @Test void missingDiagnosisTypesAreNotConsistent() {
        var f = new Fixture();
        f.plans(List.of(new DiagnosisInput("SYS", "DOMAIN", "CODE", "诊断", null)),
                List.of(new OutpatientPlanTemplateDirectory.DiagnosisSnapshot("SYS", "DOMAIN", "CODE", "诊断", null)),
                List.of(), List.of(), List.of(), List.of());
        assertEquals("NEEDS_REVIEW", f.service.compare(9L, 7L).differences().getFirst().status());
    }

    @Test void repeatedDiagnosesArePreservedWithoutLastRowOverwrite() {
        var f = new Fixture();
        var diagnosis = new DiagnosisInput("SYS", "DOMAIN", "CODE", "诊断", "PRIMARY");
        f.plans(List.of(diagnosis, diagnosis), List.of(new OutpatientPlanTemplateDirectory.DiagnosisSnapshot("SYS", "DOMAIN", "CODE", "诊断", "PRIMARY")),
                List.of(), List.of(), List.of(), List.of());
        assertReviews(f, 3);
    }

    @Test void repeatedMedicationRegimensAreNotArbitrarilyPaired() {
        var f = new Fixture();
        f.plans(List.of(), List.of(), List.of(medication(100L, BigDecimal.ONE), medication(100L, BigDecimal.TEN)),
                List.of(standardMedication(100L, BigDecimal.ONE)), List.of(), List.of());
        assertReviews(f, 3); org.mockito.Mockito.verifyNoInteractions(f.semantics);
    }

    @Test void repeatedServiceRowsAreNotOverwritten() {
        var f = new Fixture();
        f.plans(List.of(), List.of(), List.of(), List.of(), List.of(service(BigDecimal.ONE), service(BigDecimal.TEN)),
                List.of(standardService(BigDecimal.ONE)));
        assertReviews(f, 3);
    }

    @Test void missingServiceQuantitiesAreNotConsistent() {
        var f = new Fixture();
        f.plans(List.of(), List.of(), List.of(), List.of(), List.of(service(null)), List.of(standardService(null)));
        assertReviews(f, 1);
    }

    @Test void confirmedEmptyIngredientMappingsRemainActualMissingMatches() {
        var f = new Fixture(); f.medications(medication(100L, BigDecimal.ONE), standardMedication(101L, BigDecimal.ONE));
        when(f.semantics.ingredientIds(1L, 100L)).thenReturn(List.of());
        when(f.semantics.ingredientIds(1L, 101L)).thenReturn(List.of());
        assertEquals(Set.of("MISSING_IN_HISTORY", "MISSING_IN_STANDARD"), f.service.compare(9L, 7L).differences().stream()
                .map(value -> value.status()).collect(java.util.stream.Collectors.toSet()));
    }

    @Test void ingredientIdentityIsASetAndDoesNotMakeDifferentDrugsConsistent() {
        var f = new Fixture(); f.medications(medication(100L, BigDecimal.ONE), standardMedication(101L, BigDecimal.ONE));
        when(f.semantics.ingredientIds(1L, 100L)).thenReturn(List.of("A", "B", "A"));
        when(f.semantics.ingredientIds(1L, 101L)).thenReturn(List.of("B", "A"));
        var differences = f.service.compare(9L, 7L).differences();
        assertEquals(1, differences.size()); assertEquals("CONFLICT", differences.getFirst().status());
        org.mockito.Mockito.verify(f.semantics).ingredientIds(1L, 100L);
        org.mockito.Mockito.verify(f.semantics).ingredientIds(1L, 101L);
    }

    @Test void ambiguousIngredientMatchesAreAllPreservedForReview() {
        var f = new Fixture();
        f.plans(List.of(), List.of(), List.of(medication(100L, BigDecimal.ONE)),
                List.of(standardMedication(101L, BigDecimal.ONE), standardMedication(102L, BigDecimal.ONE)), List.of(), List.of());
        for (long id : List.of(100L, 101L, 102L)) when(f.semantics.ingredientIds(1L, id)).thenReturn(List.of("A"));
        assertReviews(f, 3);
    }

    @Test void nullIngredientResponseIsNotACertifiedEmptyMapping() {
        var f = new Fixture(); f.medications(medication(100L, BigDecimal.ONE), standardMedication(101L, BigDecimal.ONE));
        when(f.semantics.ingredientIds(1L, 100L)).thenReturn(null);
        org.junit.jupiter.api.Assertions.assertThrows(IllegalStateException.class, () -> f.service.compare(9L, 7L));
    }

    @Test void standardIngredientFailureAlsoPreventsACompletedComparison() {
        var f = new Fixture(); f.medications(medication(100L, BigDecimal.ONE), standardMedication(101L, BigDecimal.ONE));
        when(f.semantics.ingredientIds(1L, 100L)).thenReturn(List.of("A"));
        when(f.semantics.ingredientIds(1L, 101L)).thenThrow(new IllegalStateException("目录不可用"));
        org.junit.jupiter.api.Assertions.assertThrows(IllegalStateException.class, () -> f.service.compare(9L, 7L));
    }

    @Test void partialHistoricalVerificationKeepsVerifiedMatchesAndRejectedOriginalsDistinct() {
        var f = new Fixture();
        f.reviewItems = List.of(new com.rhn.ai.api.ClinicalAssistantContracts.HistoricalPlanReviewItem(
                "MEDICATION", 99L, 101L, 201L, "ORIGINAL", "未核对的原药品", "原包装未确认"));
        f.plans(List.of(), List.of(), List.of(medication(100L, BigDecimal.ONE)),
                List.of(standardMedication(100L, BigDecimal.ONE), standardMedication(101L, BigDecimal.ONE)), List.of(), List.of());
        var comparison = f.service.compare(9L, 7L);
        assertEquals(3, comparison.differences().size());
        assertEquals(1, comparison.differences().stream().filter(row -> "CONSISTENT".equals(row.status())).count());
        assertTrue(comparison.differences().stream().noneMatch(row -> "MISSING_IN_HISTORY".equals(row.status())));
        var rejected = comparison.differences().stream().filter(row -> row.key().startsWith("REVIEW:")).findFirst().orElseThrow();
        assertEquals("未核对的原药品", rejected.historicalDisplay());
        assertEquals("原包装未确认", rejected.reason());
        org.junit.jupiter.api.Assertions.assertNull(rejected.historicalIndex());
        org.junit.jupiter.api.Assertions.assertNull(rejected.standardIndex());
        assertEquals(99L, comparison.historicalPlan().reviewItems().getFirst().sourceId());
    }

    @Test void rejectedHistoricalDiagnosisPreventsAnAbsenceConclusion() {
        var f = new Fixture();
        f.reviewItems = List.of(new com.rhn.ai.api.ClinicalAssistantContracts.HistoricalPlanReviewItem(
                "DIAGNOSIS", 9L, null, null, "I10", "原诊断", "诊断类型未记录"));
        f.plans(List.of(), List.of(new OutpatientPlanTemplateDirectory.DiagnosisSnapshot("I10", "诊断", "PRIMARY")),
                List.of(), List.of(), List.of(), List.of());
        assertReviews(f, 2);
    }

    @Test void unassessedServiceCategoryCannotBeCalledMissingOrConsistent() {
        var f = new Fixture(); f.assessedCategories = Set.of("DIAGNOSIS", "MEDICATION");
        f.plans(List.of(), List.of(), List.of(), List.of(), List.of(), List.of(standardService(BigDecimal.ONE)));
        assertReviews(f, 1);
        f.plans(List.of(), List.of(), List.of(), List.of(), List.of(service(BigDecimal.ONE)), List.of(standardService(BigDecimal.ONE)));
        assertReviews(f, 1);
    }

    @Test void missingCoverageIsNotReplacedWithAnAssumedCompleteCategorySet() {
        var f = new Fixture(); f.assessedCategories = null;
        org.junit.jupiter.api.Assertions.assertThrows(NullPointerException.class,
                () -> f.medications(medication(100L, BigDecimal.ONE), standardMedication(100L, BigDecimal.ONE)));
    }

    private static void assertReviews(Fixture f, int count) {
        var rows = f.service.compare(9L, 7L).differences();
        assertEquals(count, rows.size());
        assertEquals(count, rows.stream().map(row -> row.key()).distinct().count());
        assertTrue(rows.stream().allMatch(row -> "NEEDS_REVIEW".equals(row.status())));
    }
    private static com.rhn.outpatient.api.OutpatientPlanTemplateContracts.ServiceInput service(BigDecimal quantity) {
        return new com.rhn.outpatient.api.OutpatientPlanTemplateContracts.ServiceInput(700L, "S", "项目", "LABORATORY", quantity, "次", "SALE", true, null, null);
    }
    private static OutpatientPlanTemplateDirectory.ServiceSnapshot standardService(BigDecimal quantity) {
        return new OutpatientPlanTemplateDirectory.ServiceSnapshot(700L, "S", "项目", "LABORATORY", quantity, "次", "SALE", true, null, null);
    }

    private static MedicationInput medication(Long id, BigDecimal quantity) {
        return new MedicationInput(id, 200L, 300L, "实际药品", "5mg", new BigDecimal("5"), "mg", "ORAL", "QD",
                new BigDecimal("30"), "天", quantity, "盒", false, false, null, "SALE", true, null);
    }
    private static OutpatientPlanTemplateDirectory.MedicationSnapshot standardMedication(Long id, BigDecimal quantity) {
        return new OutpatientPlanTemplateDirectory.MedicationSnapshot(1L, id, 200L, 300L, "WESTERN", "MED", "实际药品", "5mg", "实际产品",
                new BigDecimal("5"), "mg", "ORAL", "QD", new BigDecimal("30"), "天", quantity, "盒", null, false, false, "SALE", true, null);
    }
    private static class Fixture {
        final HistoricalPlanResolutionService historical = mock(HistoricalPlanResolutionService.class);
        final OutpatientPlanTemplateDirectory plans = mock(OutpatientPlanTemplateDirectory.class);
        final MedicationSemanticDirectory semantics = mock(MedicationSemanticDirectory.class);
        final ExecutionContextProvider contexts = mock(ExecutionContextProvider.class);
        List<com.rhn.ai.api.ClinicalAssistantContracts.HistoricalPlanReviewItem> reviewItems = List.of();
        Set<String> assessedCategories = Set.of("DIAGNOSIS", "MEDICATION", "SERVICE");
        final HistoricalPlanComparisonService service = new HistoricalPlanComparisonService(historical, plans, semantics, contexts);
        Fixture() { when(contexts.requireCurrent()).thenReturn(new ExecutionContext(1L, 2L, "doctor", "test", Set.of(),
                10L, 20L, "ASSIGNED", Set.of(), Set.of())); }
        void medications(MedicationInput left, OutpatientPlanTemplateDirectory.MedicationSnapshot right) {
            plans(List.of(), List.of(), List.of(left), List.of(right), List.of(), List.of());
        }
        void plans(List<DiagnosisInput> leftDiagnoses, List<OutpatientPlanTemplateDirectory.DiagnosisSnapshot> rightDiagnoses,
                   List<MedicationInput> leftMedications, List<OutpatientPlanTemplateDirectory.MedicationSnapshot> rightMedications,
                   List<com.rhn.outpatient.api.OutpatientPlanTemplateContracts.ServiceInput> leftServices,
                   List<OutpatientPlanTemplateDirectory.ServiceSnapshot> rightServices) {
            var historicalView = new HistoricalStablePlanView(9L, 8L, Instant.EPOCH,
                    "历史", "摘要", leftDiagnoses, leftMedications, leftServices, List.of(), reviewItems, assessedCategories);
            when(historical.resolveHistoricalStablePlan(9L)).thenReturn(Optional.of(historicalView));
            when(plans.visibleForCurrentContext()).thenReturn(List.of(new OutpatientPlanTemplateDirectory.PlanTemplateSnapshot(7L, 0,
                    "HOSPITAL", "MANUAL", null, "标准", null, 1, rightDiagnoses, rightMedications, rightServices, List.of())));
        }
    }

}
