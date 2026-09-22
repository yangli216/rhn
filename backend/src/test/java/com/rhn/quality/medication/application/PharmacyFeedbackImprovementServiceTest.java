package com.rhn.quality.medication.application;

import com.rhn.pharmacy.api.PharmacyReviewDirectory;
import com.rhn.pharmacy.api.PharmacyViews.PharmacyReviewView;
import com.rhn.outpatient.api.MedicationSafetyDecision.*;
import com.rhn.quality.medication.api.MedicationRuleIntakeContracts.*;
import com.rhn.quality.medication.api.MedicationKnowledgeRuleContracts.KnowledgeRuleCandidate;
import com.rhn.quality.medication.api.MedicationKnowledgeDraftContracts;
import com.rhn.quality.medication.infrastructure.*;
import com.rhn.shared.context.*;
import org.junit.jupiter.api.*;
import org.springframework.transaction.PlatformTransactionManager;
import java.time.Instant;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class PharmacyFeedbackImprovementServiceTest {
    final PharmacyReviewDirectory pharmacy=mock(PharmacyReviewDirectory.class);
    final MedicationRuleIntakeService intakes=mock(MedicationRuleIntakeService.class);
    final MedicationRuleIntakeStore store=mock(MedicationRuleIntakeStore.class);
    final MedicationKnowledgeRuleStore candidates=mock(MedicationKnowledgeRuleStore.class);
    final ExecutionContextProvider contexts=mock(ExecutionContextProvider.class);
    final PlatformTransactionManager tx=mock(PlatformTransactionManager.class);
    final PharmacyFeedbackImprovementService service=new PharmacyFeedbackImprovementService(pharmacy,intakes,store,candidates,contexts,tx);
    final PharmacyReviewView review=new PharmacyReviewView(9L,"R9","INTERVENE","RANGE","核查例外",7L,8L,6L,Instant.parse("2026-09-21T00:00:00Z"));
    final Finding finding=new Finding(11L,"QMED.KNOWLEDGE.20",2,"DUPLICATE_THERAPY",Severity.HIGH,Status.WARN,"合成提示",List.of(30L,31L),List.of(),OverridePolicy.ACKNOWLEDGE,"核查");
    @BeforeEach void setup() {
        when(contexts.requireCurrent()).thenReturn(new ExecutionContext(1L,2L,"药师","test",Set.of("MASTER_DATA.MANAGE","PHARMACY.DISPENSE"),3L,4L,"DEPARTMENT",Set.of(),Set.of()));
        when(pharmacy.improvementSource(5L,9L)).thenReturn(new PharmacyReviewDirectory.Source(5L,review,List.of(finding)));
        var candidate=mock(KnowledgeRuleCandidate.class);var knowledge=mock(MedicationKnowledgeDraftContracts.Version.class);var body=mock(MedicationKnowledgeDraftContracts.Body.class);
        when(candidate.version()).thenReturn(2);when(candidate.knowledge()).thenReturn(knowledge);when(knowledge.version()).thenReturn(3);when(knowledge.body()).thenReturn(body);when(body.title()).thenReturn("重复核查知识");
        when(candidates.versions(1L,20L)).thenReturn(List.of(candidate));
    }
    @Test void selected_finding_resolves_original_knowledge_not_candidate_version() {
        var origin=service.source(5L,9L,11L);
        assertThat(origin.knowledgeId()).isEqualTo(20L);assertThat(origin.knowledgeVersion()).isEqualTo(3);
        assertThat(origin.pharmacy().finding()).isEqualTo(finding);assertThat(origin.pharmacy().review()).isEqualTo(review);
        assertThat(origin.feedback()).isNull();verify(candidates).versions(1L,20L);
    }
    @Test void possible_miss_without_finding_can_start_new_knowledge() {
        var origin=service.source(5L,9L,null);
        assertThat(origin.knowledgeId()).isNull();assertThat(origin.pharmacy().finding()).isNull();
        verifyNoInteractions(candidates);
    }
    @Test void unrelated_finding_and_missing_knowledge_fail_before_model_call() {
        assertThatThrownBy(()->service.source(5L,9L,99L)).hasMessageContaining("不属于");
        when(candidates.versions(1L,20L)).thenReturn(List.of());
        assertThatThrownBy(()->service.source(5L,9L,11L)).hasMessageContaining("缺失");
        verifyNoInteractions(intakes,store);
    }
    @Test void unauthorized_context_cannot_read_clinical_feedback() {
        when(contexts.requireCurrent()).thenReturn(new ExecutionContext(1L,2L,"药师","test",Set.of("PHARMACY.DISPENSE"),3L,4L,"DEPARTMENT",Set.of(),Set.of()));
        assertThatThrownBy(()->service.source(5L,9L,null)).hasMessageContaining("知识管理权限");verifyNoInteractions(pharmacy,intakes);
    }
    @Test void clarification_cannot_switch_review_or_finding() {
        var otherOrigin=service.source(5L,9L,null);
        when(intakes.feedbackOrigin(40L)).thenReturn(otherOrigin);
        var input=new PharmacyImprovementRequest(new Request("核查重复用药",40L,List.of(new Answer("Q1","核查例外"))),11L,true);
        assertThatThrownBy(()->service.analyze(5L,9L,input)).hasMessageContaining("不属于");
        verify(intakes,never()).prepare(any());verifyNoInteractions(store);
    }
    @Test void rechecks_source_after_model_latency_before_persisting() {
        when(intakes.prepare(any())).thenReturn(mock(Run.class));
        when(pharmacy.improvementSource(5L,9L)).thenReturn(new PharmacyReviewDirectory.Source(5L,review,List.of(finding)))
                .thenThrow(new IllegalStateException("原审方不再可访问"));
        assertThatThrownBy(()->service.analyze(5L,9L,new PharmacyImprovementRequest(new Request("核查重复用药",null,List.of()),11L,true)))
                .hasMessageContaining("不再可访问");
        verify(store,never()).appendImprovement(any(),any(),any());
    }
}
