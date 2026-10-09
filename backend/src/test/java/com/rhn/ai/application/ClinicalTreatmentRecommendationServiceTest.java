package com.rhn.ai.application;

import com.rhn.ai.api.ClinicalAssistantContracts.*;
import com.rhn.outpatient.api.OutpatientPrescriptionInventoryDirectory;
import com.rhn.platform.masterdata.api.*;
import com.rhn.shared.context.*;
import com.rhn.shared.json.JsonCodec;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ClinicalTreatmentRecommendationServiceTest {
    final OutpatientPrescriptionInventoryDirectory inventory = mock(OutpatientPrescriptionInventoryDirectory.class);
    final ServiceCatalogDirectory services = mock(ServiceCatalogDirectory.class);
    final MedicationKnowledgeDirectory medications = mock(MedicationKnowledgeDirectory.class);
    final ExecutionContextProvider contexts = mock(ExecutionContextProvider.class);
    ClinicalTreatmentCatalogResolver resolver;
    ClinicalTreatmentRecommendationService service;
    final ClinicalAiModelGateway.ModelRequest request = new ClinicalAiModelGateway.ModelRequest("V8", "发热3天", null,
            null, null, List.of(), List.of(), List.of(), List.of(), null);
    @BeforeEach void setup() {
        when(contexts.requireCurrent()).thenReturn(new ExecutionContext(1L, 2L, "doctor", "test", Set.of(), 3L, 4L, "DEPARTMENT", Set.of(), Set.of()));
        JsonCodec codec = mock(JsonCodec.class);
        when(codec.read(anyString(), eq(ClinicalTreatmentCatalogResolver.Alias[].class))).thenAnswer(invocation ->
                new tools.jackson.databind.ObjectMapper().readValue((String) invocation.getArgument(0), ClinicalTreatmentCatalogResolver.Alias[].class));
        resolver = new ClinicalTreatmentCatalogResolver(inventory, services, medications, contexts, codec);
        service = new ClinicalTreatmentRecommendationService(resolver, contexts);
    }
    TreatmentRecommendation intent(String type, String name) { return new TreatmentRecommendation(type, null, null, null, name, null, "按病情评估"); }
    MasterDataViews.ServiceView lab(long id, String name, String query) {
        var value = mock(MasterDataViews.ServiceView.class);
        when(value.id()).thenReturn(id); when(value.code()).thenReturn("LAB" + id); when(value.name()).thenReturn(name);
        when(services.searchOrderableServices(eq(query), eq("LABORATORY"), eq(3L), any())).thenReturn(List.of(value));
        return value;
    }
    @Test void uniqueExactCatalogMatchUsesActualCatalogFacts() {
        lab(101, "血常规", "血常规");
        var result = service.recommend(List.of(intent("LABORATORY", "血常规")), request, null);
        assertEquals(101L, result.items().getFirst().catalogItemId());
        assertEquals("LAB101", result.items().getFirst().code());
        assertTrue(result.matches().isEmpty());
    }
    @Test void ambiguousCandidatesRemainPendingInsteadOfChoosingFirstOrUsingAnotherModel() {
        var first = lab(101, "血常规（三分类）", "血常规");
        var second = lab(102, "血常规（五分类）", "血常规");
        // Use an uncategorized general term; aliases for a specific classification must not broaden it.
        when(services.searchOrderableServices(eq("血液分析"), eq("LABORATORY"), eq(3L), any())).thenReturn(List.of(first, second));
        var result = service.recommend(List.of(intent("LABORATORY", "血液分析")), request, null);
        assertTrue(result.items().isEmpty());
        assertEquals("AMBIGUOUS", result.matches().getFirst().status());
        assertEquals(2, result.matches().getFirst().candidates().size());
    }
    @Test void compositeTestsAndAliasesResolveSeparatelyWithoutChangingHsCrpToOrdinaryCrp() {
        var five = lab(101, "血常规（五分类）", "血常规");
        var hs = lab(202, "超敏C反应蛋白测定", "C反应蛋白");
        var ordinary = mock(MasterDataViews.ServiceView.class);
        when(ordinary.id()).thenReturn(203L); when(ordinary.name()).thenReturn("C反应蛋白测定");
        when(services.searchOrderableServices(eq("C反应蛋白"), eq("LABORATORY"), eq(3L), any())).thenReturn(List.of(ordinary, hs));
        var result = resolver.resolve(List.of(intent("LABORATORY", "血常规五分类+超敏CRP")), LocalDate.now());
        assertEquals(2, result.size());
        assertTrue(result.stream().allMatch(match -> "MATCHED".equals(match.status())));
        assertEquals(List.of(101L, 202L), result.stream().map(match -> match.candidates().getFirst().catalogItemId()).toList());
    }
    @Test void maintainedAliasCorrectsWrongLabTypeAndCase() {
        lab(101, "血常规（五分类）", "血常规");
        var result = resolver.resolve(List.of(intent("medication", "血常规五分类")), LocalDate.now());
        assertEquals("medication", result.getFirst().intent().type());
        assertEquals("LABORATORY", result.getFirst().candidates().getFirst().type());
        verifyNoInteractions(inventory);
    }
    @Test void hsCrpCannotFallbackToOrdinaryCrpEvenIfItIsTheOnlyAvailableItem() {
        lab(201, "C反应蛋白测定", "C反应蛋白");
        var result = resolver.resolve(List.of(intent("LABORATORY", "超敏CRP")), LocalDate.now());
        assertEquals("NO_ORDERABLE_SERVICE", result.getFirst().status());
        assertTrue(result.getFirst().candidates().isEmpty());
    }
    @Test void duplicateSplitIntentsAreNotDuplicated() {
        lab(101, "血常规（五分类）", "血常规");
        var result = service.recommend(List.of(intent("LABORATORY", "血常规五分类+血常规五分类")), request, null);
        assertEquals(1, result.items().size());
    }
    @Test void compositeParsingPreservesIonicChargesAndParenthesizedPanels() {
        assertEquals(List.of("血常规五分类", "超敏CRP"), ClinicalTreatmentCatalogResolver.splitServiceName("血常规五分类＋超敏CRP"));
        assertEquals(List.of("钙离子（Ca2+）"), ClinicalTreatmentCatalogResolver.splitServiceName("钙离子（Ca2+）").stream()
                .map(value -> value.replace('(', '（').replace(')', '）')).toList());
        assertEquals(List.of("Na+/K+"), ClinicalTreatmentCatalogResolver.splitServiceName("Na+/K+"));
        assertEquals(List.of("甲状腺三项(T3、T4、TSH)"), ClinicalTreatmentCatalogResolver.splitServiceName("甲状腺三项(T3、T4、TSH)"));
    }
    @Test void absentServiceRemainsVisibleAndDoesNotBecomeExecutable() {
        var result = service.recommend(List.of(intent("LABORATORY", "咽拭子培养")), request, null);
        assertTrue(result.items().isEmpty());
        assertEquals("NO_ORDERABLE_SERVICE", result.matches().getFirst().status());
        assertFalse(result.alerts().isEmpty());
    }
    @Test void apiFailureIsDifferentFromEmptyCatalogAndDoesNotExposeExceptionMessages() {
        when(services.searchOrderableServices(any(), any(), any(), any())).thenThrow(new IllegalStateException("provider secret"));
        var result = resolver.resolve(List.of(intent("LABORATORY", "检查项目")), LocalDate.now());
        assertEquals("CATALOG_ERROR", result.getFirst().status());
        assertFalse(result.toString().contains("provider secret"));
    }
    @Test void badTypeRemainsPendingForInspection() {
        var result = resolver.resolve(List.of(intent("UNKNOWN", "检查项目")), LocalDate.now());
        assertEquals("INVALID_INTENT", result.getFirst().status());
        verifyNoInteractions(services, inventory);
    }
    void medication(String specification, boolean stocked) {
        var medication = mock(OutpatientPrescriptionInventoryDirectory.OrderableMedicationView.class);
        var product = mock(MasterDataViews.MedicationProductView.class);
        var adoption = mock(MasterDataViews.OrganizationAdoptionView.class);
        when(medication.sdStatus()).thenReturn("ACTIVE"); when(medication.availablePackageQuantity()).thenReturn(BigDecimal.TEN);
        when(medication.id()).thenReturn(300L); when(medication.name()).thenReturn("对乙酰氨基酚"); when(medication.code()).thenReturn("MED300");
        when(medication.preparationSpec()).thenReturn(specification); when(medication.products()).thenReturn(List.of(product));
        when(medication.preparationUnit()).thenReturn("片");
        when(product.id()).thenReturn(202L); when(product.orderable()).thenReturn(true); when(product.sdStatus()).thenReturn("ACTIVE");
        when(product.organizationAdoption()).thenReturn(adoption); when(adoption.orderable()).thenReturn(true); when(adoption.dispensable()).thenReturn(true);
        when(inventory.findOrderableMedicationCandidates(1L, 3L, 4L, "对乙酰氨基酚")).thenReturn(List.of(medication));
        when(inventory.inspectMedicationAvailability(1L, 3L, 4L, 202L, null)).thenReturn(
                new OutpatientPrescriptionInventoryDirectory.MedicationAvailabilityView(true, 8L, "药房", true,
                        null, null, null, null, stocked ? BigDecimal.TEN : BigDecimal.ZERO, stocked ? BigDecimal.TEN : BigDecimal.ZERO));
    }
    @Test void equivalentMassUnitsResolveButDifferentStrengthsRequireExplicitReview() {
        medication("0.5g", true);
        var exact = new TreatmentRecommendation("MEDICATION", null, null, null, "对乙酰氨基酚", "500mg", null);
        assertEquals(1, service.recommend(List.of(exact), request, null).items().size());
        var perTablet = new TreatmentRecommendation("MEDICATION", null, null, null, "对乙酰氨基酚", "500mg/片", null);
        assertEquals(1, service.recommend(List.of(perTablet), request, null).items().size());
        var perCapsule = new TreatmentRecommendation("MEDICATION", null, null, null, null, "500mg/粒", null);
        assertNotNull(MedicationSpecificationEvidence.reviewExplicitSpecification(perCapsule.specification(), "0.5g/片"));
        var different = new TreatmentRecommendation("MEDICATION", null, null, null, "对乙酰氨基酚", "250mg", null);
        var result = service.recommend(List.of(different), request, null);
        assertTrue(result.items().isEmpty());
        assertEquals("SPECIFICATION_REVIEW", result.matches().getFirst().status());
        assertEquals("0.5g", result.matches().getFirst().candidates().getFirst().specification());
    }
    @Test void unstockedSiblingCannotBeSelectedAsASpecificationAlternative() {
        medication("0.5g", false);
        var result = service.recommend(List.of(intent("MEDICATION", "对乙酰氨基酚")), request, null);
        assertTrue(result.items().isEmpty());
        assertTrue(result.matches().getFirst().candidates().isEmpty());
    }
    @Test void aSingleFuzzyMedicationCandidateCannotSilentlyReplaceTheRequestedIngredient() {
        medication("0.5g", true);
        var definition = inventory.findOrderableMedicationCandidates(1L, 3L, 4L, "对乙酰氨基酚").getFirst();
        when(definition.name()).thenReturn("复方对乙酰氨基酚");
        var result = service.recommend(List.of(intent("MEDICATION", "对乙酰氨基酚")), request, null);
        assertTrue(result.items().isEmpty());
        assertEquals("AMBIGUOUS", result.matches().getFirst().status());
        assertEquals(1, result.matches().getFirst().candidates().size());
    }
    @Test void unavailableMedicationIsDifferentFromAbsentDefinition() {
        var knowledge = mock(MedicationKnowledgeDirectory.Knowledge.class);
        when(medications.search("布洛芬")).thenReturn(List.of(knowledge));
        var result = resolver.resolve(List.of(intent("MEDICATION", "布洛芬"), intent("MEDICATION", "未知药品")), LocalDate.now());
        assertEquals("MEDICATION_UNAVAILABLE", result.get(0).status());
        assertEquals("MEDICATION_NOT_FOUND", result.get(1).status());
    }
    @Test void serverBusinessDateIsUsedForTheCatalogLookup() {
        LocalDate date = LocalDate.of(2026, 10, 9);
        resolver.resolve(List.of(intent("LABORATORY", "咽拭子培养")), date);
        verify(services).searchOrderableServices("咽拭子培养", "LABORATORY", 3L, date);
    }
}
