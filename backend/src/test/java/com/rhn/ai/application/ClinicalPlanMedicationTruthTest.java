package com.rhn.ai.application;

import com.rhn.ai.api.ClinicalAssistantContracts.CompilePlanDraftRequest;
import com.rhn.ai.api.ClinicalAssistantContracts.PlanReviewItem;
import com.rhn.outpatient.api.OutpatientPlanTemplateContracts.SaveRequest;
import com.rhn.outpatient.api.OutpatientPlanTemplateDirectory;
import com.rhn.outpatient.api.OutpatientPrescriptionInventoryDirectory.OrderableMedicationView;
import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory.MedicationSnapshot;
import com.rhn.platform.masterdata.api.MasterDataViews.MedicationProductView;
import com.rhn.platform.masterdata.api.MasterDataViews.PackageView;
import com.rhn.platform.masterdata.api.MedicationKnowledgeDirectory;
import com.rhn.platform.masterdata.api.MedicationRouteDirectory;
import com.rhn.platform.masterdata.api.OrderFrequencyDirectory;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.util.List;
import java.util.Set;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ClinicalPlanMedicationTruthTest {
    final MedicationCandidateMatchingService matcher = mock(MedicationCandidateMatchingService.class);
    final MedicationRouteDirectory routes = mock(MedicationRouteDirectory.class);
    final OrderFrequencyDirectory frequencies = mock(OrderFrequencyDirectory.class);
    final MedicationKnowledgeDirectory knowledge = mock(MedicationKnowledgeDirectory.class);
    final OrderableMedicationView medication = mock(OrderableMedicationView.class);
    final MedicationProductView product = mock(MedicationProductView.class);
    final PackageView itemPackage = mock(PackageView.class);
    final ClinicalPlanTemplateAiApplicationService service;

    ClinicalPlanMedicationTruthTest() {
        var contexts = mock(ExecutionContextProvider.class);
        when(contexts.requireCurrent()).thenReturn(new ExecutionContext(1L, 2L, "doctor", "test", Set.of(), 3L, 4L, "DEPARTMENT", Set.of(), Set.of()));
        service = new ClinicalPlanTemplateAiApplicationService(new MedicationIntentParser(), matcher, knowledge, routes, frequencies,
                mock(PlanInvestigationDecisionService.class), mock(DiagnosisNormalizationService.class),
                mock(ClinicalPlanRetrievalService.class), mock(OutpatientPlanTemplateDirectory.class), contexts,
                mock(ClinicalAiRuntimePolicy.class), mock(ClinicalAiModelGateway.class), mock(JsonCodec.class));
        when(routes.resolveActive(anyLong(), anyString(), anyString(), any())).thenReturn(java.util.Optional.of(
                new MedicationRouteDirectory.RouteSnapshot(1L, "ORAL", "口服", "ROUTE", "1", "ADMINISTRATION")));
        when(frequencies.active(anyLong(), anyLong(), anyLong(), anyString(), anyString(), any())).thenReturn(List.of(frequency(1L, "QD", "每日一次")));
        when(medication.id()).thenReturn(11L); when(medication.name()).thenReturn("测试药品");
        when(product.id()).thenReturn(12L); when(itemPackage.id()).thenReturn(13L); when(itemPackage.unitCode()).thenReturn("BOX");
    }
    OrderFrequencyDirectory.FrequencySnapshot frequency(long id, String code, String name) {
        return new OrderFrequencyDirectory.FrequencySnapshot(id, 1L, code, name, code, null, "REGULAR", 1,
                BigDecimal.ONE, "DAY", "FIXED", List.of(), "DEFAULT", false);
    }
    @Test void resolvesRouteAndFrequencyFromLiveContextRatherThanStaticCodes() {
        matched(MedicationCandidateMatchingService.Status.UNIQUE_MATCH);
        when(routes.resolveActive(anyLong(), anyString(), anyString(), any())).thenReturn(java.util.Optional.of(
                new MedicationRouteDirectory.RouteSnapshot(1L, "LOCAL_PO", "口服", "LOCAL", "1", "ADMINISTRATION")));
        when(frequencies.active(anyLong(), anyLong(), anyLong(), anyString(), anyString(), any())).thenReturn(List.of(frequency(1L, "LOCAL_BID", "每日两次")));
        var line = convert("每次0.5g 口服 每日两次 共2盒").medications().getFirst();
        assertEquals("LOCAL_PO", line.routeCode()); assertEquals("LOCAL_BID", line.frequencyCode());
        verify(routes).resolveActive(eq(1L), eq("口服"), eq("OUTPATIENT"), any());
        verify(frequencies).active(eq(1L), eq(3L), eq(4L), eq("OUTPATIENT"), eq("MEDICATION"), any());
    }
    @Test void insufficientStockReviewDoesNotFallBackToGenericMedication() {
        when(matcher.match(anyLong(), anyLong(), anyLong(), any())).thenReturn(
                new MedicationCandidateMatchingService.Result(MedicationCandidateMatchingService.Status.NEEDS_REVIEW,
                        medication, product, itemPackage, "当前库存不足以满足请求数量", List.of()));
        assertTrue(convert("每次0.5g 口服 QD 共2盒").medications().isEmpty());
        verifyNoInteractions(knowledge);
    }
    @Test void missingOrAmbiguousUsageDictionaryCannotBecomeExecutable() {
        matched(MedicationCandidateMatchingService.Status.UNIQUE_MATCH);
        when(routes.resolveActive(anyLong(), anyString(), anyString(), any())).thenReturn(java.util.Optional.empty());
        assertTrue(convert("每次0.5g 口服 QD 共2盒").medications().isEmpty());
        when(routes.resolveActive(anyLong(), anyString(), anyString(), any())).thenReturn(java.util.Optional.of(
                new MedicationRouteDirectory.RouteSnapshot(1L, "ORAL", "口服", "ROUTE", "1", "ADMINISTRATION")));
        when(frequencies.active(anyLong(), anyLong(), anyLong(), anyString(), anyString(), any())).thenReturn(List.of(
                frequency(1L, "LOCAL_A", "QD"), frequency(2L, "LOCAL_B", "QD")));
        var ambiguous = convert("每次0.5g 口服 QD 共2盒");
        assertTrue(ambiguous.medications().isEmpty()); assertEquals("NEEDS_REVIEW", ambiguous.tasks().getFirst().status());
        when(frequencies.active(anyLong(), anyLong(), anyLong(), anyString(), anyString(), any())).thenReturn(List.of());
        assertTrue(convert("每次0.5g 口服 QD 共2盒").medications().isEmpty());
    }
    @Test void negatedOrConflictingDirectionsNeverReachCatalogMatcher() {
        assertTrue(convert("不要口服，每次0.5g QD 共2盒").medications().isEmpty());
        assertTrue(convert("每次0.5g 口服 QD 共2盒 疗程7-10天").medications().isEmpty());
        assertTrue(convert("每次0.5g至1g 口服 QD 共2盒").medications().isEmpty());
        assertTrue(convert("每次0.5g 口服 QD 共2盒 疗程3天左右").medications().isEmpty());
        verifyNoInteractions(matcher, knowledge, routes, frequencies);
    }
    @Test void usageDirectoryFailuresPropagateWithoutCatalogFallback() {
        when(routes.resolveActive(anyLong(), anyString(), anyString(), any())).thenThrow(new IllegalStateException("途径目录不可用"));
        assertThrows(IllegalStateException.class, () -> convert("每次0.5g 口服 QD 共2盒"));
        verifyNoInteractions(matcher, knowledge, frequencies);
    }
    @Test void frequencyDirectoryFailuresPropagateWithoutCatalogFallback() {
        when(frequencies.active(anyLong(), anyLong(), anyLong(), anyString(), anyString(), any())).thenThrow(new IllegalStateException("频次目录不可用"));
        assertThrows(IllegalStateException.class, () -> convert("每次0.5g 口服 QD 共2盒"));
        verifyNoInteractions(matcher, knowledge);
    }
    void matched(MedicationCandidateMatchingService.Status status) {
        when(matcher.match(anyLong(), anyLong(), anyLong(), any())).thenReturn(
                new MedicationCandidateMatchingService.Result(status, medication, product, itemPackage, "仍需核对", List.of()));
    }
    SaveRequest convert(String details) {
        return service.convertPlanDraftFromInput(new CompilePlanDraftRequest("测试药品 " + details, "PERSONAL", "测试药品 " + details,
                null, "测试方案", List.of(new PlanReviewItem("MEDICATION", "测试药品", null, "SUGGESTED", details))));
    }
    MedicationKnowledgeDirectory.Knowledge generic(long id, String name, String status, String unit) {
        var snapshot = mock(MedicationSnapshot.class);
        when(snapshot.id()).thenReturn(id); when(snapshot.name()).thenReturn(name); when(snapshot.code()).thenReturn("M" + id);
        when(snapshot.status()).thenReturn(status); when(snapshot.preparationUnit()).thenReturn(unit);
        var result = mock(MedicationKnowledgeDirectory.Knowledge.class); when(result.medication()).thenReturn(snapshot);
        return result;
    }
    void genericSearch(List<MedicationKnowledgeDirectory.Knowledge> rows) {
        when(matcher.match(anyLong(), anyLong(), anyLong(), any())).thenReturn(MedicationCandidateMatchingService.Result.unavailable("无机构产品"));
        when(knowledge.search(anyString())).thenReturn(rows);
    }
    @Test void doesNotUpgradeMissingDirectionsOrAmbiguity() {
        for (var status : List.of(MedicationCandidateMatchingService.Status.NEEDS_REVIEW, MedicationCandidateMatchingService.Status.AMBIGUOUS)) {
            matched(status);
            var result = convert("每次0.5g 口服 QD 共2盒");
            assertTrue(result.medications().isEmpty()); assertEquals("NEEDS_REVIEW", result.tasks().getFirst().status());
        }
        verifyNoInteractions(knowledge);
    }
    @Test void keepsExplicitQuantityAndCanonicalPackageUnitWithoutInventingDuration() {
        matched(MedicationCandidateMatchingService.Status.UNIQUE_MATCH);
        var line = convert("每次0.5g 口服 QD 共2盒").medications().getFirst();
        assertEquals(new BigDecimal("0.5"), line.doseValue()); assertEquals(new BigDecimal("2"), line.quantity());
        assertEquals("BOX", line.quantityUnit()); assertNull(line.durationValue()); assertNull(line.durationUnit());
        assertTrue(line.pricingRequired());
    }
    @Test void keepsExplicitDuration() {
        matched(MedicationCandidateMatchingService.Status.UNIQUE_MATCH);
        var line = convert("每次0.5g 口服 QD 共2盒 疗程7天").medications().getFirst();
        assertEquals(new BigDecimal("7"), line.durationValue()); assertEquals("天", line.durationUnit());
    }
    @Test void cannotBuildACompleteLineFromStrengthOrDefaults() {
        matched(MedicationCandidateMatchingService.Status.UNIQUE_MATCH);
        when(medication.defaultDose()).thenReturn(BigDecimal.TEN);
        when(medication.strengthValue()).thenReturn(BigDecimal.ONE);
        for (String text : List.of("共2盒", "每次0.5g 口服 QD", "每次0g 口服 QD 共2盒", "每次0.5g 口服 QD 共0盒")) {
            var result = convert(text);
            assertTrue(result.medications().isEmpty()); assertEquals("NEEDS_REVIEW", result.tasks().getFirst().status());
        }
    }
    @Test void missingPackageUnitDoesNotBecomeBox() {
        matched(MedicationCandidateMatchingService.Status.UNIQUE_MATCH); when(itemPackage.unitCode()).thenReturn(null);
        var result = convert("每次0.5g 口服 QD 共2盒");
        assertTrue(result.medications().isEmpty()); assertEquals("NEEDS_REVIEW", result.tasks().getFirst().status());
    }
    @Test void genericDrugRequiresUniqueActiveExactIdentity() {
        for (var rows : List.of(List.of(generic(1, "复方测试药品", "ACTIVE", "片")),
                List.of(generic(1, "测试药品", "SUSPENDED", "片")),
                List.of(generic(1, "测试药品", "ACTIVE", "片"), generic(2, "测试药品", "ACTIVE", "片")))) {
            genericSearch(rows);
            var result = convert("每次0.5g 口服 QD 共2片");
            assertTrue(result.medications().isEmpty()); assertEquals("UNMATCHED", result.tasks().getFirst().status());
        }
    }
    @Test void genericDrugDoesNotInventUnitsOrUseUnverifiedPackageConversions() {
        for (String unit : new String[]{null, "盒"}) {
            genericSearch(List.of(generic(1, "测试药品", "ACTIVE", unit)));
            var result = convert("每次0.5g 口服 QD 共2片");
            assertTrue(result.medications().isEmpty()); assertEquals("NEEDS_REVIEW", result.tasks().getFirst().status());
        }
    }
    @Test void genericDrugDoesNotInventDirectionsOrQuantity() {
        genericSearch(List.of(generic(1, "测试药品", "ACTIVE", "片")));
        var result = convert("建议规格：0.5g；发热时考虑");
        assertTrue(result.medications().isEmpty()); assertEquals("NEEDS_REVIEW", result.tasks().getFirst().status());
    }
    @Test void explicitGenericDrugDoesNotWaivePricingOrInventCourse() {
        genericSearch(List.of(generic(1, "测试药品", "ACTIVE", "片")));
        var result = convert("每次0.5g 口服 QD 共2片");
        var line = result.medications().getFirst();
        assertEquals("MATCHED", result.tasks().getFirst().status()); assertNull(line.catalogItemId()); assertNull(line.packageId());
        assertNull(line.pricingRequired()); assertNull(line.durationValue()); assertNull(line.durationUnit());
        assertEquals(new BigDecimal("2"), line.quantity()); assertEquals("片", line.quantityUnit());
    }
    @Test void sourceSpecificationIsValidatedEvenWhenTheProductMatcherReportsSuccess() {
        matched(MedicationCandidateMatchingService.Status.UNIQUE_MATCH);
        when(medication.preparationSpec()).thenReturn("1g");
        var result = convert("规格：0.5g；每次0.5g 口服 QD 共2盒");
        assertTrue(result.medications().isEmpty());
        assertEquals("NEEDS_REVIEW", result.tasks().getFirst().status());
        verifyNoInteractions(knowledge);
        when(medication.preparationSpec()).thenReturn("0.50 g");
        assertEquals(1, convert("规格：0.5g；每次0.5g 口服 QD 共2盒").medications().size());
    }
    @Test void genericFallbackCannotBypassAnExplicitSpecification() {
        var row = generic(1, "测试药品", "ACTIVE", "片");
        genericSearch(List.of(row));
        for (String specification : new String[]{null, "1g"}) {
            when(row.medication().preparationSpec()).thenReturn(specification);
            var result = convert("规格：0.5g；每次0.5g 口服 QD 共2片");
            assertTrue(result.medications().isEmpty());
            assertEquals("NEEDS_REVIEW", result.tasks().getFirst().status());
        }
        when(row.medication().preparationSpec()).thenReturn("0.50g");
        assertEquals(1, convert("规格：0.5g；每次0.5g 口服 QD 共2片").medications().size());
    }
    @Test void directoryFailurePropagatesRatherThanBecomingAnEmptyMatch() {
        genericSearch(List.of()); when(knowledge.search(anyString())).thenThrow(new IllegalStateException("目录不可用"));
        assertThrows(IllegalStateException.class, () -> convert("每次0.5g 口服 QD 共2片"));
    }
}
