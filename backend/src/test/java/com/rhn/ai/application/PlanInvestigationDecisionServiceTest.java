package com.rhn.ai.application;

import com.rhn.platform.masterdata.api.MasterDataViews.ServiceView;
import com.rhn.platform.masterdata.api.ItemAliasDirectory;
import com.rhn.platform.masterdata.api.ItemGroupDirectory;
import com.rhn.platform.masterdata.api.ServiceCatalogDirectory;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.json.JsonCodec;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import java.time.LocalDate;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class PlanInvestigationDecisionServiceTest {
    final ClinicalAiRuntimePolicy policy = mock(ClinicalAiRuntimePolicy.class);
    final DecisionModelGateway gateway = mock(DecisionModelGateway.class);
    final JsonCodec json = mock(JsonCodec.class);
    final ServiceCatalogDirectory catalog = mock(ServiceCatalogDirectory.class);
    final TreatmentCatalogDecisionService decisions = new TreatmentCatalogDecisionService(policy, gateway, json);
    final PlanInvestigationDecisionService service = new PlanInvestigationDecisionService(catalog, decisions);
    final ExecutionContext context = new ExecutionContext(1L, 2L, "doctor", "test", Set.of(), 3L, 4L, "DEPARTMENT", Set.of(), Set.of());
    final LocalDate today = LocalDate.of(2026, 9, 30);
    final PlanInvestigationDecisionService.Intent intent = new PlanInvestigationDecisionService.Intent("LABORATORY", "血常规检查");
    ServiceView candidate;

    @BeforeEach void setup() {
        var mapper = JsonMapper.builder().build();
        when(json.write(any())).thenAnswer(call -> mapper.writeValueAsString(call.getArgument(0)));
        when(json.readTree(anyString())).thenAnswer(call -> mapper.readTree((String) call.getArgument(0)));
        when(policy.text(anyLong(), anyString(), anyString())).thenAnswer(call -> call.getArgument(2));
        when(policy.number(anyLong(), anyString(), anyLong())).thenAnswer(call -> call.getArgument(2));
        when(policy.booleanValue(anyLong(), anyString(), anyBoolean())).thenAnswer(call -> call.getArgument(2));
        when(policy.text(1L, "decision-mode", "DISABLED")).thenReturn("ASSIST");
        when(policy.booleanValue(1L, DecisionScene.PLAN_COMPILATION.settingKey(), false)).thenReturn(true);
        when(policy.secret(1L, "decision-api-key", null)).thenReturn("shared-key");
        candidate = item(101L, "血常规", "LABORATORY");
        when(catalog.searchOrderableServices(anyString(), anyString(), anyLong(), any())).thenReturn(List.of());
        when(catalog.searchOrderableServices("血常规", "LABORATORY", 3L, today)).thenReturn(List.of(candidate));
        answer("LABORATORY|101", .99);
    }
    ServiceView item(long id, String name, String type) {
        var item = mock(ServiceView.class);
        when(item.id()).thenReturn(id); when(item.name()).thenReturn(name);
        when(item.code()).thenReturn("ITEM" + id); when(item.sdServiceType()).thenReturn(type);
        return item;
    }
    void answer(String choice, double confidence) {
        when(gateway.decide(any(), any())).thenReturn(new DecisionModelGateway.Result("trace", "jev-1.13.0",
                Map.of("intent_0", new DecisionModelGateway.ChoiceAnswer(choice,
                        Map.of("LABORATORY|101", .95, "NONE", .05), confidence)), 10));
    }
    @Test void exactUniqueMatchDoesNotCallJev() {
        var exact = new PlanInvestigationDecisionService.Intent("LABORATORY", "血常规");
        var resolution = service.resolve(List.of(exact), context, today).get(exact.key());
        assertSame(candidate, resolution.item());
        assertNull(resolution.items().getFirst().quantity());
        verifyNoInteractions(gateway);
    }

    @Test void chargeabilityIsResolvedFromTheMatchingInstitutionAdoption() {
        var adoption = mock(com.rhn.platform.masterdata.api.MasterDataViews.OrganizationAdoptionView.class);
        when(candidate.organizationAdoption()).thenReturn(adoption);
        when(candidate.chargeable()).thenReturn(true);
        when(adoption.chargeable()).thenReturn(true);
        when(adoption.catalogItemId()).thenReturn(101L);
        when(adoption.organizationId()).thenReturn(3L);
        var exact = new PlanInvestigationDecisionService.Intent("LABORATORY", "血常规");
        assertEquals(Boolean.TRUE, service.resolve(List.of(exact), context, today).get(exact.key()).items().getFirst().chargeable());
        when(adoption.chargeable()).thenReturn(false);
        assertEquals(Boolean.FALSE, service.resolve(List.of(exact), context, today).get(exact.key()).items().getFirst().chargeable());
        when(adoption.organizationId()).thenReturn(99L);
        assertNull(service.resolve(List.of(exact), context, today).get(exact.key()).items().getFirst().chargeable());
    }

    @Test void incompleteOptionalMembershipCannotBeSilentlyDroppedDuringMatching() {
        var aliases = mock(ItemAliasDirectory.class);
        var groups = mock(ItemGroupDirectory.class);
        when(groups.searchOrderableGroups(1L, 3L, "LABORATORY", "肾功能", today)).thenReturn(List.of(
                new ItemGroupDirectory.ItemGroupSnapshot(901L, 0L, "RENAL", "肾功能", "LIS", List.of(), List.of(13L))));
        var result = new PlanInvestigationDecisionService(catalog, decisions, aliases, groups)
                .resolve(List.of(new PlanInvestigationDecisionService.Intent("LABORATORY", "肾功能")), context, today)
                .get("LABORATORY|肾功能");
        assertTrue(result.requiresReview());
        assertTrue(result.items().isEmpty());
        verifyNoInteractions(gateway);
    }
    @Test void fuzzyMatchUsesOnlyRecalledCatalogIds() {
        assertSame(candidate, service.resolve(List.of(intent), context, today).get(intent.key()).item());
        verify(gateway).decide(argThat(input -> input.version().contains("PLAN_COMPILATION")
                && input.questions().getFirst().criteria().containsKey("NONE")), argThat(settings -> settings.apiKey().equals("shared-key")));
    }
    @Test void sceneOffDoesNotExpandRecallOrCallJev() {
        when(policy.booleanValue(1L, DecisionScene.PLAN_COMPILATION.settingKey(), false)).thenReturn(false);
        assertNull(service.resolve(List.of(intent), context, today).get(intent.key()).item());
        verify(catalog, never()).searchOrderableServices("血常规", "LABORATORY", 3L, today);
        verifyNoInteractions(gateway);
    }
    @Test void shadowKeepsTheOriginalUnmatchedResult() {
        when(policy.text(1L, "decision-mode", "DISABLED")).thenReturn("SHADOW");
        var resolution = service.resolve(List.of(intent), context, today).get(intent.key());
        assertNull(resolution.item()); assertTrue(resolution.detail().contains("旁路"));
        verify(gateway).decide(any(), any());
    }
    @Test void uncertainInventedAndNoMatchAnswersRemainUnmatched() {
        for (var choice : List.of("LABORATORY|999", "NONE")) {
            answer(choice, .99);
            assertNull(service.resolve(List.of(intent), context, today).get(intent.key()).item());
        }
        answer("LABORATORY|101", .4);
        assertNull(service.resolve(List.of(intent), context, today).get(intent.key()).item());
        when(gateway.decide(any(), any())).thenThrow(new RuntimeException("secret-provider-body"));
        var failed = service.resolve(List.of(intent), context, today).get(intent.key());
        assertNull(failed.item()); assertFalse(failed.detail().contains("secret-provider-body"));
    }
    @Test void multipleAmbiguousIntentsAreBatchedAndDuplicatesAreCollapsed() {
        var exam = new PlanInvestigationDecisionService.Intent("EXAMINATION", "心电检查");
        var ecg = item(202L, "心电图", "EXAMINATION");
        when(catalog.searchOrderableServices("心电检查", "EXAMINATION", 3L, today)).thenReturn(List.of(ecg));
        when(gateway.decide(any(), any())).thenAnswer(call -> {
            DecisionModelGateway.Request request = call.getArgument(0);
            var answers = new LinkedHashMap<String, DecisionModelGateway.ChoiceAnswer>();
            for (var question : request.questions()) {
                String id = question.criteria().keySet().stream().filter(key -> !key.equals("NONE")).findFirst().orElseThrow();
                answers.put(question.id(), new DecisionModelGateway.ChoiceAnswer(id, Map.of(id, .99, "NONE", .01), .99));
            }
            return new DecisionModelGateway.Result("trace", "jev-1.13.0", answers, 10);
        });
        var result = service.resolve(List.of(intent, exam, intent), context, today);
        assertEquals(2, result.size()); assertSame(candidate, result.get(intent.key()).item()); assertSame(ecg, result.get(exam.key()).item());
        verify(gateway, times(1)).decide(argThat(request -> request.questions().size() == 2), any());
    }

    @Test void cReactiveProteinMatchesAssayDirectly() {
        var crp = item(301L, "C反应蛋白测定", "LABORATORY");
        var crpIntent = new PlanInvestigationDecisionService.Intent("LABORATORY", "C反应蛋白");
        when(catalog.searchOrderableServices("C反应蛋白", "LABORATORY", 3L, today)).thenReturn(List.of(crp));
        assertSame(crp, service.resolve(List.of(crpIntent), context, today).get(crpIntent.key()).item());
        verifyNoInteractions(gateway);
    }

    @Test void cReactiveProteinRecallsAssayWhenInitialSearchFails() {
        var crp = item(301L, "C反应蛋白测定", "LABORATORY");
        var crpIntent = new PlanInvestigationDecisionService.Intent("LABORATORY", "C反应蛋白");
        when(catalog.searchOrderableServices("C反应蛋白", "LABORATORY", 3L, today)).thenReturn(List.of());
        when(catalog.searchOrderableServices("C反应蛋白测定", "LABORATORY", 3L, today)).thenReturn(List.of(crp));
        assertSame(crp, service.resolve(List.of(crpIntent), context, today).get(crpIntent.key()).item());
        verifyNoInteractions(gateway);
    }

    @Test void exactAliasMatchIsDeterministicAndDoesNotCallJev() {
        ItemAliasDirectory aliases = mock(ItemAliasDirectory.class);
        ItemGroupDirectory groups = mock(ItemGroupDirectory.class);
        when(catalog.searchOrderableServices("空腹血糖", "LABORATORY", 3L, today)).thenReturn(List.of(candidate));
        when(aliases.findActiveServiceIdsByAlias(1L, "空腹血糖")).thenReturn(Set.of(101L));
        when(catalog.findOrderableServicesByIds(Set.of(101L), 3L, today)).thenReturn(List.of(candidate));
        var value = new PlanInvestigationDecisionService(catalog, decisions, aliases, groups)
                .resolve(List.of(new PlanInvestigationDecisionService.Intent("LABORATORY", "空腹血糖")), context, today)
                .get("LABORATORY|空腹血糖");
        assertSame(candidate, value.item());
        assertEquals("ALIAS", value.matchType());
        assertTrue(value.detail().contains("别名"));
        verifyNoInteractions(gateway);
    }

    @Test void aliasUniquenessChecksEveryConfiguredTargetEvenWhenSearchFoundOne() {
        var aliases = mock(ItemAliasDirectory.class);
        var groups = mock(ItemGroupDirectory.class);
        when(aliases.findActiveServiceIdsByAlias(1L, "空腹血糖")).thenReturn(Set.of(101L, 102L));
        when(catalog.searchOrderableServices("空腹血糖", "LABORATORY", 3L, today)).thenReturn(List.of(candidate));
        var other = item(102L, "另一项目", "LABORATORY");
        when(catalog.findOrderableServicesByIds(Set.of(101L, 102L), 3L, today))
                .thenReturn(List.of(candidate, other));
        var result = new PlanInvestigationDecisionService(catalog, decisions, aliases, groups)
                .resolve(List.of(new PlanInvestigationDecisionService.Intent("LABORATORY", "空腹血糖")), context, today)
                .get("LABORATORY|空腹血糖");
        assertTrue(result.requiresReview());
        assertTrue(result.items().isEmpty());
        verifyNoInteractions(groups, gateway);
    }

    @Test void wrongTypeAliasTargetsCannotBecomeExecutableMatchesOrTriggerFallbackSelection() {
        var aliases = mock(ItemAliasDirectory.class);
        var groups = mock(ItemGroupDirectory.class);
        when(aliases.findActiveServiceIdsByAlias(1L, "空腹血糖")).thenReturn(Set.of(102L));
        var other = item(102L, "其他类型", "EXAMINATION");
        when(catalog.findOrderableServicesByIds(Set.of(102L), 3L, today))
                .thenReturn(List.of(other));
        var result = new PlanInvestigationDecisionService(catalog, decisions, aliases, groups)
                .resolve(List.of(new PlanInvestigationDecisionService.Intent("LABORATORY", "空腹血糖")), context, today)
                .get("LABORATORY|空腹血糖");
        assertTrue(result.requiresReview());
        verifyNoInteractions(groups, gateway);
    }

    @Test void ambiguousOrOnlyFuzzyGroupsCannotFallThroughToSingleServiceSelection() {
        var aliases = mock(ItemAliasDirectory.class);
        var groups = mock(ItemGroupDirectory.class);
        var first = new ItemGroupDirectory.ItemGroupSnapshot(901L, 0L, "RENAL-A", "肾功能", "LIS", List.of(), List.of());
        var second = new ItemGroupDirectory.ItemGroupSnapshot(902L, 0L, "RENAL-B", "肾功能", "LIS", List.of(), List.of());
        var fuzzy = new ItemGroupDirectory.ItemGroupSnapshot(903L, 0L, "RENAL-C", "肾功能扩展组套", "LIS", List.of(), List.of());
        for (var candidates : List.of(List.of(first, second), List.of(fuzzy))) {
            when(groups.searchOrderableGroups(1L, 3L, "LABORATORY", "肾功能", today)).thenReturn(candidates);
            var result = new PlanInvestigationDecisionService(catalog, decisions, aliases, groups)
                    .resolve(List.of(new PlanInvestigationDecisionService.Intent("LABORATORY", "肾功能")), context, today)
                    .get("LABORATORY|肾功能");
            assertTrue(result.requiresReview());
            assertTrue(result.items().isEmpty());
        }
        verifyNoInteractions(gateway);
    }

    @Test void expandedRecallDoesNotTurnMultipleExactNamesIntoAModelChoice() {
        var rows = List.of(item(201L, "C反应蛋白测定", "LABORATORY"), item(202L, "C反应蛋白测定", "LABORATORY"));
        when(catalog.searchOrderableServices("C反应蛋白测定", "LABORATORY", 3L, today)).thenReturn(rows);
        var result = service.resolve(List.of(new PlanInvestigationDecisionService.Intent("LABORATORY", "C反应蛋白")), context, today)
                .get("LABORATORY|C反应蛋白");
        assertTrue(result.requiresReview());
        assertEquals(2, result.exactCount());
        verifyNoInteractions(gateway);
    }

    @Test void excessiveCandidatesAreReportedAsUnresolvedInsteadOfAbsent() {
        var rows = java.util.stream.LongStream.range(100, 165).mapToObj(id -> item(id, "血常规项目" + id, "LABORATORY")).toList();
        when(catalog.searchOrderableServices("血常规检查", "LABORATORY", 3L, today)).thenReturn(rows);
        var result = service.resolve(List.of(intent), context, today).get(intent.key());
        assertTrue(result.requiresReview());
        assertTrue(result.items().isEmpty());
        verifyNoInteractions(gateway);
    }

    @Test void groupMatchExpandsMembersWhenCompositeNameIncludesHints() {
        ItemAliasDirectory aliases = mock(ItemAliasDirectory.class);
        ItemGroupDirectory groups = mock(ItemGroupDirectory.class);
        when(catalog.searchOrderableServices("肾功能（含肌酐、尿素氮、血尿酸）", "LABORATORY", 3L, today))
                .thenReturn(List.of());
        var group = new ItemGroupDirectory.ItemGroupSnapshot(901L, 0L, "RENAL", "肾功能", "LIS", List.of(
                new ItemGroupDirectory.MemberSnapshot(11L, "CRE", "肌酐测定", "LABORATORY", java.math.BigDecimal.ONE, "项", "采血后及时送检", true, "项", true),
                new ItemGroupDirectory.MemberSnapshot(12L, "BUN", "尿素氮测定", "LABORATORY", java.math.BigDecimal.ONE, "项", "采血后及时送检", true, "项", true),
                new ItemGroupDirectory.MemberSnapshot(13L, "UA", "血清尿酸测定", "LABORATORY", java.math.BigDecimal.ONE, "项", "采血后及时送检", true, "项", true)), List.of());
        when(groups.searchOrderableGroups(1L, 3L, "LABORATORY", "肾功能", today)).thenReturn(List.of(group));
        var value = new PlanInvestigationDecisionService(catalog, decisions, aliases, groups)
                .resolve(List.of(new PlanInvestigationDecisionService.Intent(
                        "LABORATORY", "肾功能（含肌酐、尿素氮、血尿酸）")), context, today)
                .get("LABORATORY|肾功能（含肌酐、尿素氮、血尿酸）");
        assertTrue(value.groupMatch());
        assertNull(value.item());
        assertEquals(3, value.items().size());
        assertEquals("采血后及时送检", value.items().getFirst().memberDescription());
        assertEquals(Boolean.TRUE, value.items().getFirst().chargeable());
        assertTrue(value.items().getFirst().requiredMember());
        assertTrue(value.detail().contains("组套"));
    }

    @Test
    void chestRadiographyExpandsAnatomicalSiteAndCallsJevDecision() {
        var chestDr = item(203L, "胸部数字化X线摄影", "EXAMINATION");
        var chestIntent = new PlanInvestigationDecisionService.Intent("EXAMINATION", "胸部X线摄片");
        when(catalog.searchOrderableServices("胸部X线摄片", "EXAMINATION", 3L, today)).thenReturn(List.of());
        when(catalog.searchOrderableServices("胸部X线摄影", "EXAMINATION", 3L, today)).thenReturn(List.of());
        when(catalog.searchOrderableServices("胸部", "EXAMINATION", 3L, today)).thenReturn(List.of(chestDr));
        answer("EXAMINATION|203", .98);

        var result = service.resolve(List.of(chestIntent), context, today).get(chestIntent.key());
        assertSame(chestDr, result.item());
        assertEquals("DECISION", result.matchType());
    }

    @Test
    void aliasDirectLookupWorksEvenWhenInitialSearchIsEmpty() {
        ItemAliasDirectory aliases = mock(ItemAliasDirectory.class);
        ItemGroupDirectory groups = mock(ItemGroupDirectory.class);
        var chestDr = item(203L, "胸部数字化X线摄影", "EXAMINATION");
        var chestIntent = new PlanInvestigationDecisionService.Intent("EXAMINATION", "胸部X线摄片");

        when(catalog.searchOrderableServices("胸部X线摄片", "EXAMINATION", 3L, today)).thenReturn(List.of());
        when(aliases.findActiveServiceIdsByAlias(1L, "胸部X线摄片")).thenReturn(Set.of(203L));
        when(catalog.findOrderableServicesByIds(Set.of(203L), 3L, today)).thenReturn(List.of(chestDr));

        var value = new PlanInvestigationDecisionService(catalog, decisions, aliases, groups)
                .resolve(List.of(chestIntent), context, today)
                .get(chestIntent.key());

        assertSame(chestDr, value.item());
        assertEquals("ALIAS", value.matchType());
        assertTrue(value.detail().contains("别名"));
        verifyNoInteractions(gateway);
    }
}
