package com.rhn.ai.application;

import com.rhn.outpatient.api.OutpatientPrescriptionInventoryDirectory;
import com.rhn.platform.masterdata.api.MasterDataViews.ServiceView;
import com.rhn.platform.masterdata.api.MedicationKnowledgeDirectory;
import com.rhn.platform.masterdata.api.ServiceCatalogDirectory;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** Plan compilation reuses the curated alias table of the AI assistant; ambiguity is reviewed, never chosen. */
class PlanInvestigationCuratedAliasTest {
    final ServiceCatalogDirectory catalog = mock(ServiceCatalogDirectory.class);
    final ExecutionContext context = new ExecutionContext(1L, 2L, "doctor", "test", Set.of(), 3L, 4L, "DEPARTMENT", Set.of(), Set.of());
    final LocalDate today = LocalDate.of(2026, 10, 15);
    PlanInvestigationDecisionService service;

    @BeforeEach void setup() {
        var contexts = mock(ExecutionContextProvider.class);
        when(contexts.requireCurrent()).thenReturn(context);
        JsonCodec codec = mock(JsonCodec.class);
        when(codec.read(anyString(), eq(ClinicalTreatmentCatalogResolver.Alias[].class))).thenAnswer(invocation ->
                new tools.jackson.databind.ObjectMapper().readValue((String) invocation.getArgument(0), ClinicalTreatmentCatalogResolver.Alias[].class));
        var resolver = new ClinicalTreatmentCatalogResolver(mock(OutpatientPrescriptionInventoryDirectory.class), catalog,
                mock(MedicationKnowledgeDirectory.class), contexts, codec);
        service = new PlanInvestigationDecisionService(catalog, mock(TreatmentCatalogDecisionService.class), null, null, resolver);
        when(catalog.searchOrderableServices(anyString(), anyString(), anyLong(), any())).thenReturn(List.of());
    }

    ServiceView item(long id, String name, String type) {
        var item = mock(ServiceView.class);
        when(item.id()).thenReturn(id); when(item.name()).thenReturn(name);
        when(item.code()).thenReturn("ITEM" + id); when(item.sdServiceType()).thenReturn(type);
        when(item.unitCode()).thenReturn("次");
        return item;
    }

    PlanInvestigationDecisionService.Resolution resolve(String type, String name) {
        var intent = new PlanInvestigationDecisionService.Intent(type, name);
        return service.resolve(List.of(intent), context, today).get(intent.key());
    }

    @Test void abbreviatedNameMatchesTheOnlyCatalogItemThroughTheCuratedAlias() {
        var crp = item(296, "C-反应蛋白测定（CRP）", "LABORATORY");
        var hs = item(295, "超敏C反应蛋白测定", "LABORATORY");
        when(catalog.searchOrderableServices(eq("C反应蛋白"), eq("LABORATORY"), eq(3L), any())).thenReturn(List.of(crp, hs));
        when(catalog.searchOrderableServices(eq("CRP"), eq("LABORATORY"), eq(3L), any())).thenReturn(List.of(crp));
        when(catalog.findOrderableServicesByIds(eq(List.of(296L)), eq(3L), any())).thenReturn(List.of(crp));

        var resolution = resolve("LABORATORY", "C反应蛋白测定");

        assertEquals("ALIAS", resolution.matchType());
        assertSame(crp, resolution.item());
        assertEquals(296L, resolution.items().getFirst().id());
        assertFalse(resolution.requiresReview());
    }

    @Test void ambiguousNameIsLeftForReviewAndListsTheCandidates() {
        var five = item(270, "血常规（五分类）", "LABORATORY");
        var three = item(271, "血常规（三分类）", "LABORATORY");
        when(catalog.searchOrderableServices(eq("血常规"), eq("LABORATORY"), eq(3L), any())).thenReturn(List.of(five, three));

        var resolution = resolve("LABORATORY", "血常规");

        assertTrue(resolution.requiresReview());
        assertNull(resolution.item());
        assertTrue(resolution.items().isEmpty());
        assertTrue(resolution.detail().contains("未自动选择"), resolution.detail());
        assertTrue(resolution.detail().contains("血常规（五分类）") && resolution.detail().contains("血常规（三分类）"), resolution.detail());
        assertEquals(2, resolution.exactCount());
    }

    @Test void exactCatalogNameStillWinsBeforeAnyAlias() {
        var exact = item(101, "血常规", "LABORATORY");
        when(catalog.searchOrderableServices(eq("血常规"), eq("LABORATORY"), eq(3L), any())).thenReturn(List.of(exact));

        var resolution = resolve("LABORATORY", "血常规");

        assertEquals("EXACT", resolution.matchType());
        assertSame(exact, resolution.item());
    }

    @Test void namesWithoutACuratedAliasAreNotWidenedToFreeSearch() {
        var broader = item(501, "甲状腺功能三项检测套餐", "LABORATORY");
        when(catalog.searchOrderableServices(eq("甲状腺功能三项"), eq("LABORATORY"), eq(3L), any())).thenReturn(List.of(broader));

        var resolution = resolve("LABORATORY", "甲状腺功能三项");

        assertNull(resolution.item());
        assertTrue(resolution.items().isEmpty());
        assertFalse(resolution.requiresReview());
        assertEquals("", resolution.matchType());
    }

    @Test void aliasOfAnotherServiceTypeIsNotApplied() {
        var five = item(270, "血常规（五分类）", "LABORATORY");
        when(catalog.searchOrderableServices(eq("血常规"), anyString(), eq(3L), any())).thenReturn(List.of(five));

        var resolution = resolve("EXAMINATION", "血常规");

        assertFalse(resolution.requiresReview());
        assertTrue(resolution.items().isEmpty());
    }

    @Test void aliasTargetUnavailableInThisOrganizationIsReviewedNotMatched() {
        var crp = item(296, "C-反应蛋白测定（CRP）", "LABORATORY");
        when(catalog.searchOrderableServices(eq("CRP"), eq("LABORATORY"), eq(3L), any())).thenReturn(List.of(crp));
        when(catalog.findOrderableServicesByIds(anyList(), anyLong(), any())).thenReturn(List.of());

        var resolution = resolve("LABORATORY", "C反应蛋白测定");

        assertTrue(resolution.requiresReview());
        assertTrue(resolution.items().isEmpty());
    }
}
