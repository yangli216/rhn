package com.rhn.ai.application;

import com.rhn.ai.api.ClinicalAssistantContracts.CompilePlanDraftRequest;
import com.rhn.ai.api.ClinicalAssistantContracts.PlanReviewItem;
import com.rhn.outpatient.api.OutpatientPlanTemplateDirectory;
import com.rhn.platform.masterdata.api.MedicationKnowledgeDirectory;
import com.rhn.platform.masterdata.api.MedicationRouteDirectory;
import com.rhn.platform.masterdata.api.OrderFrequencyDirectory;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ClinicalPlanInvestigationTruthTest {
    final PlanInvestigationDecisionService decisions = mock(PlanInvestigationDecisionService.class);
    final ClinicalPlanTemplateAiApplicationService service;

    ClinicalPlanInvestigationTruthTest() {
        var contexts = mock(ExecutionContextProvider.class);
        when(contexts.requireCurrent()).thenReturn(new ExecutionContext(1L, 2L, "doctor", "test", Set.of(), 3L, 4L, "DEPARTMENT", Set.of(), Set.of()));
        service = new ClinicalPlanTemplateAiApplicationService(new MedicationIntentParser(),
                mock(MedicationCandidateMatchingService.class), mock(MedicationKnowledgeDirectory.class),
                mock(MedicationRouteDirectory.class), mock(OrderFrequencyDirectory.class), decisions,
                mock(DiagnosisNormalizationService.class), mock(ClinicalPlanRetrievalService.class),
                mock(OutpatientPlanTemplateDirectory.class), contexts, mock(ClinicalAiRuntimePolicy.class),
                mock(ClinicalAiModelGateway.class), mock(JsonCodec.class));
        resolution(false, List.of(member(101L, null, "EA")));
    }

    PlanInvestigationDecisionService.ResolvedItem member(Long id, String quantity, String unit) {
        return new PlanInvestigationDecisionService.ResolvedItem(id, "ITEM" + id, "检验" + id,
                "LABORATORY", quantity == null ? null : new BigDecimal(quantity), unit, unit, true, null, true);
    }

    void resolution(boolean group, List<PlanInvestigationDecisionService.ResolvedItem> items) {
        when(decisions.resolve(anyList(), any(), any())).thenReturn(Map.of("LABORATORY|血常规",
                new PlanInvestigationDecisionService.Resolution(null, items, "", 1, group ? "GROUP" : "EXACT")));
    }

    PlanReviewItem item(String details) {
        return new PlanReviewItem("LABORATORY", "血常规", null, "SUGGESTED", details);
    }

    com.rhn.outpatient.api.OutpatientPlanTemplateContracts.SaveRequest convert(PlanReviewItem... items) {
        return service.convertPlanDraftFromInput(new CompilePlanDraftRequest("完善血常规", "PERSONAL", "完善血常规",
                null, "检验方案", List.of(items)));
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "用于评估", "数量：0 EA", "数量：-2 EA", "数量：2-3 EA", "数量：约2 EA",
            "数量：2 次", "数量：2", "数量：二 EA", "数量：2 EA；数量：3 EA", "数量：2 EA；共3EA", "数量：2 EA，3EA"})
    void missingInvalidConflictingOrUnverifiedUnitDoesNotBecomeOne(String details) {
        var result = convert(item(details));
        assertTrue(result.services().isEmpty());
        assertEquals("NEEDS_REVIEW", result.tasks().getFirst().status());
    }

    @Test void preservesExplicitDecimalQuantityAndEntireInstruction() {
        String details = "数量：2.5 EA；目的：评估贫血；嘱托：采样前核对身份";
        var result = convert(item(details));
        var line = result.services().getFirst();
        assertEquals(new BigDecimal("2.5"), line.quantity());
        assertEquals("EA", line.unitCode());
        assertTrue(line.clinicalDescription().contains(details));
        assertEquals("MATCHED", result.tasks().getFirst().status());
    }

    @ParameterizedTest
    @ValueSource(strings = {"不要查血常规", "高热持续时考虑", "必要时复查", "若阳性再查", "暂缓执行", "每日执行", "最多2次", "当患者同意时执行", "if fever"})
    void restrictionsAreNotErasedByCatalogMatching(String restriction) {
        var result = convert(item("数量：2 EA；" + restriction));
        assertTrue(result.services().isEmpty());
        assertEquals("NEEDS_REVIEW", result.tasks().getFirst().status());
        assertTrue(result.tasks().getFirst().details().contains(restriction));
    }

    @Test void sourceQuoteRestrictionsAreAlsoChecked() {
        var result = service.convertPlanDraftFromInput(new CompilePlanDraftRequest("暂不查血常规", "PERSONAL", "暂不查血常规",
                null, "检验方案", List.of(new PlanReviewItem("LABORATORY", "血常规", "暂不查血常规", "EXPLICIT", null))));
        assertTrue(result.services().isEmpty());
        assertEquals("NEEDS_REVIEW", result.tasks().getFirst().status());
    }

    @Test void duplicateTaskRemainsUnresolvedWithoutMergingOrLosingQuantity() {
        var result = convert(item("数量：2 EA"), item("数量：3 EA"));
        assertEquals(1, result.services().size());
        assertEquals(new BigDecimal("2"), result.services().getFirst().quantity());
        assertEquals("MATCHED", result.tasks().getFirst().status());
        assertEquals("NEEDS_REVIEW", result.tasks().get(1).status());
    }

    @Test void validGroupUsesActualMemberAmounts() {
        resolution(true, List.of(member(101L, "2.5", "EA"), member(102L, "3", "项")));
        var result = convert(item("目的：评估贫血"));
        assertEquals(List.of(new BigDecimal("2.5"), new BigDecimal("3")), result.services().stream().map(s -> s.quantity()).toList());
        assertEquals("MATCHED", result.tasks().getFirst().status());
    }

    @Test void groupMemberDescriptionIsRetainedInTheGeneratedOrder() {
        resolution(true, List.of(new PlanInvestigationDecisionService.ResolvedItem(101L, "CBC", "血常规", "LABORATORY",
                new BigDecimal("2.5"), "EA", "EA", true, "采血后及时送检", true)));
        assertTrue(convert(item("目的：评估贫血")).services().getFirst().clinicalDescription().contains("采血后及时送检"));
    }

    @Test void unresolvedOptionalMembersUnitsPricingOrInstructionsBlockTheWholeGroup() {
        for (var unresolved : List.of(
                new PlanInvestigationDecisionService.ResolvedItem(102L, "CBC", "血常规", "LABORATORY", BigDecimal.ONE, "EA", "EA", false, null, true),
                new PlanInvestigationDecisionService.ResolvedItem(102L, "CBC", "血常规", "LABORATORY", BigDecimal.ONE, "EA", "ML", true, null, true),
                new PlanInvestigationDecisionService.ResolvedItem(102L, "CBC", "血常规", "LABORATORY", BigDecimal.ONE, "EA", "EA", true, null, false),
                new PlanInvestigationDecisionService.ResolvedItem(102L, "CBC", "血常规", "LABORATORY", BigDecimal.ONE, "EA", "EA", true, null, null),
                new PlanInvestigationDecisionService.ResolvedItem(102L, "CBC", "血常规", "LABORATORY", BigDecimal.ONE, "EA", "EA", true, "必要时复查", true))) {
            resolution(true, List.of(member(101L, "2", "EA"), unresolved));
            var result = convert(item(""));
            assertTrue(result.services().isEmpty());
            assertEquals("NEEDS_REVIEW", result.tasks().getFirst().status());
        }
    }

    @Test void unresolvedGroupAvailabilityCannotBecomeUnmatchedOrMatched() {
        when(decisions.resolve(anyList(), any(), any())).thenReturn(Map.of("LABORATORY|血常规",
                new PlanInvestigationDecisionService.Resolution(null, List.of(), "组套成员不可用", 0, "GROUP_REVIEW")));
        var result = convert(item(""));
        assertTrue(result.services().isEmpty());
        assertEquals("NEEDS_REVIEW", result.tasks().getFirst().status());
        assertEquals("组套成员不可用", result.tasks().getFirst().details());
    }

    @Test void singleServiceWithUnconfirmedPricingDoesNotBecomeAFreeOrder() {
        resolution(false, List.of(new PlanInvestigationDecisionService.ResolvedItem(101L, "CBC", "血常规", "LABORATORY",
                null, "EA", "EA", false, null, false)));
        var result = convert(item("数量：2 EA"));
        assertTrue(result.services().isEmpty());
        assertEquals("NEEDS_REVIEW", result.tasks().getFirst().status());
    }

    @Test void invalidGroupCannotLeavePartiallyExpandedOrders() {
        for (var invalid : List.of(member(102L, null, "EA"), member(102L, "0", "EA"),
                member(102L, "-1", "EA"), member(102L, "2", ""), member(101L, "2", "EA"))) {
            resolution(true, List.of(member(101L, "2", "EA"), invalid));
            var result = convert(item(""));
            assertTrue(result.services().isEmpty());
            assertEquals("NEEDS_REVIEW", result.tasks().getFirst().status());
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"数量：2 EA", "共2套", "执行2次", "执行二次", "数量：待确认"})
    void explicitGroupCountDoesNotSilentlyOverrideMemberAmounts(String details) {
        resolution(true, List.of(member(101L, "2.5", "EA")));
        var result = convert(item(details));
        assertTrue(result.services().isEmpty());
        assertEquals("NEEDS_REVIEW", result.tasks().getFirst().status());
    }
}
