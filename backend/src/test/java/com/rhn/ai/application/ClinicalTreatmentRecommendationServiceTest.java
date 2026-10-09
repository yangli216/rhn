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
    final TreatmentCatalogDecisionService decisions = mock(TreatmentCatalogDecisionService.class);
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
        when(decisions.match(anyList(), any())).thenReturn(new TreatmentCatalogDecisionService.Attempt(
                false, List.of(), List.of(), null, false));
        service = new ClinicalTreatmentRecommendationService(resolver, contexts, decisions);
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
    @Test void sputumIntentsFindGeneralMethodsOnlyAsExplicitReviewCandidates() {
        lab(301, "一般细菌涂片检查", "一般细菌涂片检查");
        lab(302, "一般细菌培养及鉴定", "一般细菌培养及鉴定");
        var result = service.recommend(List.of(intent("LABORATORY", "痰涂片革兰染色"),
                intent("EXAMINATION", "痰培养")), request, null);
        assertTrue(result.items().isEmpty());
        assertEquals(2, result.matches().size());
        assertTrue(result.matches().stream().allMatch(match -> "AMBIGUOUS".equals(match.status())));
        assertEquals(List.of(301L, 302L), result.matches().stream()
                .map(match -> match.candidates().getFirst().catalogItemId()).toList());
        assertEquals("一般细菌培养及鉴定", result.matches().get(1).candidates().getFirst().name());
        assertEquals("LABORATORY", result.matches().get(1).candidates().getFirst().type());
        assertTrue(result.matches().getFirst().reason().contains("标本、检查方法"));
    }
    @Test void sputumCultureRejectsUnrelatedCultureCandidatesAndKeepsExactSputumMatch() {
        var general = lab(301, "一般细菌培养及鉴定", "一般细菌培养及鉴定");
        var blood = lab(302, "血培养及鉴定", "细菌培养");
        var fungi = lab(303, "真菌培养及鉴定", "细菌培养");
        var urine = lab(304, "尿培养加菌落计数", "细菌培养");
        when(services.searchOrderableServices(eq("细菌培养"), eq("LABORATORY"), eq(3L), any()))
                .thenReturn(List.of(general, blood, fungi, urine));
        var reviewed = resolver.resolve(List.of(intent("LABORATORY", "痰培养")), LocalDate.now()).getFirst();
        assertEquals("AMBIGUOUS", reviewed.status());
        assertEquals(List.of(301L), reviewed.candidates().stream().map(TreatmentRecommendation::catalogItemId).toList());
        lab(305, "痰培养", "痰培养");
        var exact = service.recommend(List.of(intent("LABORATORY", "痰培养")), request, null);
        assertEquals(305L, exact.items().getFirst().catalogItemId());
        assertTrue(exact.matches().isEmpty());
    }
    @Test void chestCtCannotBeReplacedByChestXrayAndSpecificProtocolsRequireReview() {
        var xray = mock(MasterDataViews.ServiceView.class);
        when(xray.name()).thenReturn("胸部数字化X线摄影");
        when(services.searchOrderableServices(eq("胸部"), eq("EXAMINATION"), eq(3L), any())).thenReturn(List.of(xray));
        var absent = resolver.resolve(List.of(intent("EXAMINATION", "胸部CT")), LocalDate.now()).getFirst();
        assertEquals("NO_ORDERABLE_SERVICE", absent.status());
        assertTrue(absent.candidates().isEmpty());
        var plain = mock(MasterDataViews.ServiceView.class);
        when(plain.id()).thenReturn(401L); when(plain.name()).thenReturn("胸部CT平扫");
        when(plain.code()).thenReturn("CT401");
        when(services.searchOrderableServices(eq("胸部CT"), eq("EXAMINATION"), eq(3L), any())).thenReturn(List.of(plain));
        var specific = service.recommend(List.of(intent("EXAMINATION", "胸部CT")), request, null);
        assertTrue(specific.items().isEmpty());
        assertEquals("AMBIGUOUS", specific.matches().getFirst().status());
        assertEquals(401L, specific.matches().getFirst().candidates().getFirst().catalogItemId());
    }
    @Test void chestCtFindsSingleSiteMethodsForReviewWithoutSelectingExtrasOrOtherSites() {
        var plain = mock(MasterDataViews.ServiceView.class);
        when(plain.id()).thenReturn(410L); when(plain.name()).thenReturn("CT平扫（一个部位）");
        var enhanced = mock(MasterDataViews.ServiceView.class);
        when(enhanced.id()).thenReturn(411L); when(enhanced.name()).thenReturn("CT增强扫描（一个部位）");
        var head = mock(MasterDataViews.ServiceView.class);
        when(head.name()).thenReturn("头颅CT平扫");
        var extra = mock(MasterDataViews.ServiceView.class);
        when(extra.name()).thenReturn("16层及以上多排螺旋CT扫描加收");
        var multi = mock(MasterDataViews.ServiceView.class);
        when(multi.name()).thenReturn("CT平扫（≥三个部位）");
        when(services.searchOrderableServices(eq("CT"), eq("EXAMINATION"), eq(3L), any()))
                .thenReturn(List.of(plain, enhanced, head, extra, multi));
        var result = service.recommend(List.of(intent("EXAMINATION", "胸部CT")), request, null);
        assertTrue(result.items().isEmpty());
        var match = result.matches().getFirst();
        assertEquals("AMBIGUOUS", match.status());
        assertEquals(List.of(410L, 411L), match.candidates().stream().map(TreatmentRecommendation::catalogItemId).toList());
        assertTrue(match.reason().contains("部位、检查方式"));
    }
    @Test void pulseOximetryCannotBeReplacedByBloodGasAnalysis() {
        var gas = mock(MasterDataViews.ServiceView.class);
        when(gas.name()).thenReturn("血气分析");
        when(services.searchOrderableServices(eq("指脉氧"), eq("EXAMINATION"), eq(3L), any())).thenReturn(List.of(gas));
        var result = resolver.resolve(List.of(intent("EXAMINATION", "指脉氧饱和度监测")), LocalDate.now()).getFirst();
        assertEquals("NO_ORDERABLE_SERVICE", result.status());
        assertTrue(result.candidates().isEmpty());
    }
    @Test void procalcitoninAndFunctionAliasesUseActualCatalogNamesWithoutInventingServices() {
        lab(501, "降钙素原测定", "降钙素原");
        var result = service.recommend(List.of(intent("LABORATORY", "PCT"),
                intent("EXAMINATION", "肺功能检查")), request, null);
        assertEquals("降钙素原测定", result.items().getFirst().name());
        assertEquals(501L, result.items().getFirst().catalogItemId());
        assertEquals("NO_ORDERABLE_SERVICE", result.matches().getFirst().status());
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
    @Test void rawLowConfidenceIsVisibleAndNeverAutomaticallySelectsPendingItems() {
        var candidate = lab(101, "血常规（三分类）", "血常规");
        var second = lab(102, "血常规（五分类）", "血常规");
        when(services.searchOrderableServices(eq("血常规"), eq("LABORATORY"), eq(3L), any())).thenReturn(List.of(candidate, second));
        var raw = new DecisionModelGateway.Result("trace", "jev-1.13.0", java.util.Map.of("intent_0",
                new DecisionModelGateway.ChoiceAnswer("LABORATORY|101", java.util.Map.of("LABORATORY|101", .73, "NONE", .27), .73)), 25);
        when(decisions.match(anyList(), any())).thenReturn(new TreatmentCatalogDecisionService.Attempt(false, List.of(), List.of(), raw, true, "SHADOW", .9));
        var result = service.recommend(List.of(intent("LABORATORY", "血常规")), request, null);
        assertTrue(result.items().isEmpty());
        var review = result.matches().getFirst().decisionReview();
        assertEquals("COMPLETED", review.status()); assertEquals(.73, review.confidence());
        assertEquals(.9, review.threshold()); assertEquals("SHADOW", review.mode());
        assertEquals(101L, review.suggestedItem().catalogItemId());
    }
    @Test void noneAndAssistHighConfidenceRemainHumanReviewed() {
        lab(301, "一般细菌培养及鉴定", "一般细菌培养及鉴定");
        for (String choice : List.of("NONE", "LABORATORY|301")) {
            var raw = new DecisionModelGateway.Result("trace", "jev-1.13.0", java.util.Map.of("intent_0",
                    new DecisionModelGateway.ChoiceAnswer(choice, java.util.Map.of(choice, .99), .99)), 25);
            when(decisions.match(anyList(), any())).thenReturn(new TreatmentCatalogDecisionService.Attempt(true, List.of(), List.of(), raw, false, "ASSIST", .9));
            var result = service.recommend(List.of(intent("LABORATORY", "痰培养")), request, null);
            assertTrue(result.items().isEmpty()); assertEquals("AMBIGUOUS", result.matches().getFirst().status());
            var review = result.matches().getFirst().decisionReview();
            assertEquals(.99, review.confidence()); assertEquals(choice, review.choice());
            if ("NONE".equals(choice)) assertNull(review.suggestedItem());
            else assertEquals(301L, review.suggestedItem().catalogItemId());
        }
    }
    @Test void unavailableDecisionDoesNotMasqueradeAsZeroConfidenceOrHideCatalogCandidates() {
        lab(301, "一般细菌培养及鉴定", "一般细菌培养及鉴定");
        when(decisions.match(anyList(), any())).thenReturn(new TreatmentCatalogDecisionService.Attempt(false, List.of(),
                List.of(new SafetyAlert("INFO", "核查失败", "失败")), null, false));
        var matches = service.resolve(List.of(intent("LABORATORY", "痰培养"), intent("EXAMINATION", "肺功能检查")), LocalDate.now());
        assertEquals("UNAVAILABLE", matches.get(0).decisionReview().status());
        assertNull(matches.get(0).decisionReview().confidence()); assertEquals(1, matches.get(0).candidates().size());
        assertEquals("NO_CANDIDATES", matches.get(1).decisionReview().status());
        verify(decisions).match(argThat(groups -> groups.size() == 1), any());
    }
    @Test void explicitServiceSelectionUsesIdentityAndCurrentOrderabilityInsteadOfAiAliasFilter() {
        var actual = mock(MasterDataViews.ServiceView.class);
        when(actual.id()).thenReturn(501L); when(actual.sdServiceType()).thenReturn("EXAMINATION");
        when(actual.name()).thenReturn("CT平扫（一个部位）"); when(actual.code()).thenReturn("CT501");
        LocalDate date = LocalDate.of(2026, 10, 9);
        when(services.findOrderableServicesByIds(List.of(501L), 3L, date)).thenReturn(List.of(actual));
        var selected = new TreatmentRecommendation("EXAMINATION", 501L, null, null, "胸部CT", null, null);
        var match = resolver.resolve(List.of(selected), date).getFirst();
        assertEquals("MATCHED", match.status()); assertEquals(actual.name(), match.candidates().getFirst().name());
        verify(services, never()).searchOrderableServices(any(), any(), any(), any());
        when(actual.sdServiceType()).thenReturn("LABORATORY");
        assertEquals("NO_ORDERABLE_SERVICE", resolver.resolve(List.of(selected), date).getFirst().status());
        when(services.findOrderableServicesByIds(List.of(501L), 3L, date)).thenReturn(List.of());
        assertEquals("NO_ORDERABLE_SERVICE", resolver.resolve(List.of(selected), date).getFirst().status());
    }
    @Test void explicitMedicationIdentityCannotFallBackToASiblingProduct() {
        medication("0.5g", true);
        var selected = new TreatmentRecommendation("MEDICATION", 202L, 300L, null, "对乙酰氨基酚", "0.5g", null);
        assertEquals("MATCHED", resolver.resolve(List.of(selected), LocalDate.now()).getFirst().status());
        var wrongProduct = new TreatmentRecommendation("MEDICATION", 999L, 300L, null, selected.name(), selected.specification(), null);
        assertTrue(resolver.resolve(List.of(wrongProduct), LocalDate.now()).getFirst().candidates().isEmpty());
        var wrongDefinition = new TreatmentRecommendation("MEDICATION", 202L, 999L, null, selected.name(), selected.specification(), null);
        assertTrue(resolver.resolve(List.of(wrongDefinition), LocalDate.now()).getFirst().candidates().isEmpty());
    }
    @Test void modelSuppliedIdentityCannotBypassMethodReview() {
        var plain = mock(MasterDataViews.ServiceView.class);
        when(plain.id()).thenReturn(401L); when(plain.name()).thenReturn("胸部CT平扫");
        when(services.searchOrderableServices(eq("胸部CT"), eq("EXAMINATION"), eq(3L), any())).thenReturn(List.of(plain));
        var modelIntent = new TreatmentRecommendation("EXAMINATION", 401L, null, null, "胸部CT", null, null);
        var result = service.recommend(List.of(modelIntent), request, null);
        assertTrue(result.items().isEmpty()); assertEquals("AMBIGUOUS", result.matches().getFirst().status());
        verify(services, never()).findOrderableServicesByIds(any(), any(), any());
    }
}
