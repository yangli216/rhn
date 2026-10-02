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
        assertSame(candidate, service.resolve(List.of(exact), context, today).get(exact.key()).item());
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
        var value = new PlanInvestigationDecisionService(catalog, decisions, aliases, groups)
                .resolve(List.of(new PlanInvestigationDecisionService.Intent("LABORATORY", "空腹血糖")), context, today)
                .get("LABORATORY|空腹血糖");
        assertSame(candidate, value.item());
        assertEquals("ALIAS", value.matchType());
        assertTrue(value.detail().contains("别名"));
        verifyNoInteractions(gateway);
    }

    @Test void groupMatchExpandsMembersWhenCompositeNameIncludesHints() {
        ItemAliasDirectory aliases = mock(ItemAliasDirectory.class);
        ItemGroupDirectory groups = mock(ItemGroupDirectory.class);
        when(catalog.searchOrderableServices("肾功能（含肌酐、尿素氮、血尿酸）", "LABORATORY", 3L, today))
                .thenReturn(List.of());
        var group = new ItemGroupDirectory.ItemGroupSnapshot(901L, 0L, "RENAL", "肾功能", "LIS", List.of(
                new ItemGroupDirectory.MemberSnapshot(11L, "CRE", "肌酐测定", "LABORATORY", java.math.BigDecimal.ONE, "项", null, true),
                new ItemGroupDirectory.MemberSnapshot(12L, "BUN", "尿素氮测定", "LABORATORY", java.math.BigDecimal.ONE, "项", null, true),
                new ItemGroupDirectory.MemberSnapshot(13L, "UA", "血清尿酸测定", "LABORATORY", java.math.BigDecimal.ONE, "项", null, true)));
        when(groups.searchOrderableGroups(1L, 3L, "LABORATORY", "肾功能", today)).thenReturn(List.of(group));
        var value = new PlanInvestigationDecisionService(catalog, decisions, aliases, groups)
                .resolve(List.of(new PlanInvestigationDecisionService.Intent(
                        "LABORATORY", "肾功能（含肌酐、尿素氮、血尿酸）")), context, today)
                .get("LABORATORY|肾功能（含肌酐、尿素氮、血尿酸）");
        assertTrue(value.groupMatch());
        assertNull(value.item());
        assertEquals(3, value.items().size());
        assertTrue(value.detail().contains("组套"));
    }
}
