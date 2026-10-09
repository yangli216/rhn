package com.rhn.ai.application;

import com.rhn.ai.api.ClinicalAssistantContracts.*;
import com.rhn.outpatient.api.OutpatientPrescriptionInventoryDirectory;
import com.rhn.platform.masterdata.api.MasterDataViews;
import com.rhn.platform.masterdata.api.ServiceCatalogDirectory;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
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
    final ExecutionContextProvider contexts = mock(ExecutionContextProvider.class);
    final ClinicalAiModelGateway gateway = mock(ClinicalAiModelGateway.class);
    final ClinicalAssistantSettings settings = mock(ClinicalAssistantSettings.class);
    final TreatmentCatalogDecisionService decisions = mock(TreatmentCatalogDecisionService.class);
    final ClinicalTreatmentRecommendationService service = new ClinicalTreatmentRecommendationService(inventory, services, contexts, gateway, decisions);
    final ClinicalAiModelGateway.ModelRequest request = new ClinicalAiModelGateway.ModelRequest("V8", "发热3天", null,
            null, null, List.of(), List.of(), List.of(), List.of(),
            new SuggestionContent("已生成病历", new RecordDraft("发热3天", null, null, null, null),
                    List.of(), List.of(), List.of(), List.of(), List.of(), "待核对"));
    @BeforeEach void context() {
        when(decisions.match(anyList(), any())).thenReturn(new TreatmentCatalogDecisionService.Attempt(false, List.of(), List.of(), null, false));
        when(contexts.requireCurrent()).thenReturn(new ExecutionContext(1L, 2L, "doctor", "test", Set.of(),
                3L, 4L, "DEPARTMENT", Set.of(), Set.of()));
    }
    TreatmentRecommendation intent(String type, String name) {
        return new TreatmentRecommendation(type, null, null, null, name, null, "按病情评估");
    }
    void laboratory() {
        var lab = mock(MasterDataViews.ServiceView.class);
        when(lab.id()).thenReturn(101L); when(lab.code()).thenReturn("LAB001"); when(lab.name()).thenReturn("血常规");
        when(services.searchOrderableServices(eq("血常规"), eq("LABORATORY"), eq(3L), any())).thenReturn(List.of(lab));
    }
    SuggestionContent selected(List<TreatmentRecommendation> items) {
        return new SuggestionContent(null, null, List.of(), List.of(), List.of(), List.of(), List.of(), null, items);
    }
    @Test void canonicalizesSelectedCatalogIdsAndDropsInventedOrWrongTypeIds() {
        laboratory();
        when(services.searchOrderableServices(eq("血常规检查"), eq("LABORATORY"), eq(3L), any()))
                .thenAnswer(invocation -> services.searchOrderableServices("血常规", "LABORATORY", 3L, LocalDate.now()));
        when(gateway.analyze(any(), eq(settings))).thenReturn(selected(List.of(
                new TreatmentRecommendation("LABORATORY", 101L, 999L, "WRONG", "模型改名", "伪规格", "评估感染指标"),
                new TreatmentRecommendation("LABORATORY", 999L, null, "X", "虚构项目", null, "错误"),
                new TreatmentRecommendation("MEDICATION", 101L, null, "X", "类型伪造", null, "错误"))));
        var result = service.recommend(List.of(intent("LABORATORY", "血常规检查")), request, settings);
        assertEquals(1, result.items().size());
        assertEquals("血常规", result.items().getFirst().name());
        assertEquals("LAB001", result.items().getFirst().code());
        assertNull(result.items().getFirst().medicationId());
        assertNull(result.items().getFirst().rationale());
        verify(gateway).analyze(argThat(value -> "CATALOG_TREATMENT".equals(value.generationStage())
                && value.availableTreatments().size() == 1 && value.priorSuggestion() == request.priorSuggestion()), eq(settings));
    }
    @Test void uniqueExactCatalogMatchSkipsSecondModelPass() {
        laboratory();
        var result = service.recommend(List.of(intent("LABORATORY", "血常规")), request, settings);
        assertEquals(1, result.items().size());
        assertEquals(101L, result.items().getFirst().catalogItemId());
        assertEquals("血常规", result.items().getFirst().name());
        assertNull(result.items().getFirst().rationale());
        verifyNoInteractions(gateway);
    }
    @Test void ambiguousCatalogMatchesStillUseConstrainedSecondPass() {
        var first = mock(MasterDataViews.ServiceView.class);
        var second = mock(MasterDataViews.ServiceView.class);
        when(first.id()).thenReturn(101L); when(first.code()).thenReturn("LAB001"); when(first.name()).thenReturn("血常规五分类");
        when(second.id()).thenReturn(102L); when(second.code()).thenReturn("LAB002"); when(second.name()).thenReturn("血常规三分类");
        when(services.searchOrderableServices(eq("血常规"), eq("LABORATORY"), eq(3L), any())).thenReturn(List.of(first, second));
        when(gateway.analyze(any(), eq(settings))).thenReturn(selected(List.of(
                new TreatmentRecommendation("LABORATORY", 101L, null, "WRONG", "模型改名", null, "适合本次就诊"))));
        var result = service.recommend(List.of(intent("LABORATORY", "血常规")), request, settings);
        assertEquals(List.of(101L), result.items().stream().map(TreatmentRecommendation::catalogItemId).toList());
        verify(gateway).analyze(argThat(value -> "CATALOG_TREATMENT".equals(value.generationStage())
                && value.availableTreatments().size() == 2), eq(settings));
    }
    @Test void missingCatalogDoesNotProduceExecutableSuggestionsOrCallSecondPass() {
        var result = service.recommend(List.of(intent("LABORATORY", "不存在项目")), request, settings);
        assertTrue(result.items().isEmpty()); assertFalse(result.alerts().isEmpty()); verifyNoInteractions(gateway);
    }
    @Test void selectionFailureKeepsFirstPassAvailableAndReportsPartialFailure() {
        laboratory();
        when(services.searchOrderableServices(eq("血常规检查"), eq("LABORATORY"), eq(3L), any()))
                .thenAnswer(invocation -> services.searchOrderableServices("血常规", "LABORATORY", 3L, LocalDate.now()));
        when(gateway.analyze(any(), any())).thenThrow(new IllegalStateException("provider secret"));
        var result = service.recommend(List.of(intent("LABORATORY", "血常规检查")), request, settings);
        assertTrue(result.items().isEmpty()); assertFalse(result.alerts().isEmpty());
        assertFalse(result.alerts().toString().contains("provider secret"));
        assertEquals("发热3天", request.priorSuggestion().recordDraft().chiefComplaint());
    }
    @Test void rejectsUnstockedSiblingEvenWhenGenericMedicationHasStock() {
        var medication = mock(OutpatientPrescriptionInventoryDirectory.OrderableMedicationView.class);
        var product = mock(MasterDataViews.MedicationProductView.class);
        var adoption = mock(MasterDataViews.OrganizationAdoptionView.class);
        when(medication.sdStatus()).thenReturn("ACTIVE"); when(medication.availablePackageQuantity()).thenReturn(BigDecimal.TEN);
        when(medication.products()).thenReturn(List.of(product));
        when(product.id()).thenReturn(202L); when(product.orderable()).thenReturn(true); when(product.sdStatus()).thenReturn("ACTIVE");
        when(product.organizationAdoption()).thenReturn(adoption); when(adoption.orderable()).thenReturn(true); when(adoption.dispensable()).thenReturn(true);
        when(inventory.findOrderableMedicationCandidates(1L, 3L, 4L, "退热药")).thenReturn(List.of(medication));
        when(inventory.inspectMedicationAvailability(1L, 3L, 4L, 202L, null)).thenReturn(
                new OutpatientPrescriptionInventoryDirectory.MedicationAvailabilityView(true, 8L, "药房", false,
                        null, null, null, null, BigDecimal.ZERO, BigDecimal.ZERO));
        var result = service.recommend(List.of(intent("MEDICATION", "退热药")), request, settings);
        assertTrue(result.items().isEmpty()); verifyNoInteractions(gateway);
    }

    @Test void assistedMatchSkipsLlmAndStillCanonicalizesAllowedIds() {
        laboratory();
        when(services.searchOrderableServices(eq("血常规检查"), eq("LABORATORY"), eq(3L), any()))
                .thenAnswer(invocation -> services.searchOrderableServices("血常规", "LABORATORY", 3L, LocalDate.now()));
        var candidate = new TreatmentRecommendation("LABORATORY", 101L, null, "LAB001", "血常规", null, "按病情评估");
        var invented = new TreatmentRecommendation("LABORATORY", 999L, null, "X", "虚构", null, "错误");
        when(decisions.match(anyList(), any())).thenReturn(new TreatmentCatalogDecisionService.Attempt(true,
                List.of(candidate, invented), List.of(), null, false));
        var result = service.recommend(List.of(intent("LABORATORY", "血常规检查")), request, settings);
        assertEquals(List.of(101L), result.items().stream().map(TreatmentRecommendation::catalogItemId).toList());
        verifyNoInteractions(gateway);
    }

    @Test void failuresPreserveExactMatchesFromOtherIntents() {
        laboratory();
        var other = mock(MasterDataViews.ServiceView.class);
        when(other.id()).thenReturn(201L); when(other.name()).thenReturn("肝功能组合");
        when(services.searchOrderableServices(eq("肝功能"), eq("LABORATORY"), eq(3L), any())).thenReturn(List.of(other));
        when(gateway.analyze(any(), any())).thenThrow(new IllegalStateException("private error"));
        var result = service.recommend(List.of(intent("LABORATORY", "血常规"), intent("LABORATORY", "肝功能")), request, settings);
        assertEquals(List.of(101L), result.items().stream().map(TreatmentRecommendation::catalogItemId).toList());
    }

    @Test void tooManyCandidatesDoNotProduceASelectionFromATruncatedSubset() {
        var rows = java.util.stream.LongStream.range(100, 165).mapToObj(id -> {
            var value = mock(MasterDataViews.ServiceView.class);
            when(value.id()).thenReturn(id);
            when(value.code()).thenReturn("LAB" + id);
            when(value.name()).thenReturn("检验项目" + id);
            return value;
        }).toList();
        when(services.searchOrderableServices(eq("检验"), eq("LABORATORY"), eq(3L), any())).thenReturn(rows);
        var result = service.recommend(List.of(intent("LABORATORY", "检验")), request, settings);
        assertTrue(result.items().isEmpty());
        assertTrue(result.alerts().stream().anyMatch(alert -> alert.detail().contains("未截取")));
        verifyNoInteractions(gateway, decisions);
    }

    @Test void unavailableEarlyMedicationRowsDoNotHideAnOrderableNinthMedication() {
        var rows = new java.util.ArrayList<OutpatientPrescriptionInventoryDirectory.OrderableMedicationView>();
        for (int index = 0; index < 8; index++) {
            var inactive = mock(OutpatientPrescriptionInventoryDirectory.OrderableMedicationView.class);
            when(inactive.sdStatus()).thenReturn("INACTIVE");
            rows.add(inactive);
        }
        var medication = mock(OutpatientPrescriptionInventoryDirectory.OrderableMedicationView.class);
        var product = mock(MasterDataViews.MedicationProductView.class);
        var adoption = mock(MasterDataViews.OrganizationAdoptionView.class);
        when(medication.sdStatus()).thenReturn("ACTIVE");
        when(medication.availablePackageQuantity()).thenReturn(BigDecimal.ONE);
        when(medication.products()).thenReturn(List.of(product));
        when(medication.id()).thenReturn(300L);
        when(medication.name()).thenReturn("退热药");
        when(medication.code()).thenReturn("MED300");
        when(product.id()).thenReturn(202L);
        when(product.orderable()).thenReturn(true);
        when(product.sdStatus()).thenReturn("ACTIVE");
        when(product.organizationAdoption()).thenReturn(adoption);
        when(adoption.orderable()).thenReturn(true);
        when(adoption.dispensable()).thenReturn(true);
        rows.add(medication);
        when(inventory.findOrderableMedicationCandidates(1L, 3L, 4L, "退热药")).thenReturn(rows);
        when(inventory.inspectMedicationAvailability(1L, 3L, 4L, 202L, null)).thenReturn(
                new OutpatientPrescriptionInventoryDirectory.MedicationAvailabilityView(true, 8L, "药房", true,
                        null, null, null, null, BigDecimal.ONE, BigDecimal.ONE));
        var result = service.recommend(List.of(intent("MEDICATION", "退热药")), request, settings);
        assertEquals(List.of(202L), result.items().stream().map(TreatmentRecommendation::catalogItemId).toList());
        verifyNoInteractions(gateway);
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.CsvSource({"5.00mg,true", "10mg,false", ",false"})
    void recommendationsRespectRequestedSpecificationBeforeModelSelection(String catalogSpec, boolean matched) {
        var medication = mock(OutpatientPrescriptionInventoryDirectory.OrderableMedicationView.class);
        var product = mock(MasterDataViews.MedicationProductView.class);
        var adoption = mock(MasterDataViews.OrganizationAdoptionView.class);
        when(medication.sdStatus()).thenReturn("ACTIVE");
        when(medication.availablePackageQuantity()).thenReturn(BigDecimal.ONE);
        when(medication.products()).thenReturn(List.of(product));
        when(medication.id()).thenReturn(300L);
        when(medication.name()).thenReturn("测试药品");
        when(medication.code()).thenReturn("MED300");
        when(medication.preparationSpec()).thenReturn(catalogSpec);
        when(product.id()).thenReturn(202L);
        when(product.orderable()).thenReturn(true);
        when(product.sdStatus()).thenReturn("ACTIVE");
        when(product.organizationAdoption()).thenReturn(adoption);
        when(adoption.orderable()).thenReturn(true);
        when(adoption.dispensable()).thenReturn(true);
        when(inventory.findOrderableMedicationCandidates(1L, 3L, 4L, "测试药品")).thenReturn(List.of(medication));
        when(inventory.inspectMedicationAvailability(1L, 3L, 4L, 202L, null)).thenReturn(
                new OutpatientPrescriptionInventoryDirectory.MedicationAvailabilityView(true, 8L, "药房", true,
                        null, null, null, null, BigDecimal.ONE, BigDecimal.ONE));

        var intent = new TreatmentRecommendation("MEDICATION", null, null, null, "测试药品", "5mg", "来源明确规格");
        var result = service.recommend(List.of(intent), request, settings);

        assertEquals(matched ? 1 : 0, result.items().size());
        if (!matched) assertTrue(result.alerts().stream().anyMatch(alert -> alert.detail().contains("规格")));
        verifyNoInteractions(gateway, decisions);
    }
}
