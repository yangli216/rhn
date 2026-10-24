package com.rhn;

import com.rhn.ai.api.DecisionObservationContracts.*;
import com.rhn.ai.api.ClinicalAssistantContracts.TreatmentRecommendation;
import com.rhn.ai.api.ClinicalTriageContracts.AssessmentRequest;
import com.rhn.ai.application.*;
import com.rhn.ai.infrastructure.DecisionObservationStore;
import com.rhn.outpatient.api.OutpatientTriageAssessmentDirectory;
import com.rhn.outpatient.api.OutpatientTriageAssessmentDirectory.*;
import com.rhn.quality.medication.application.MedicationWorkbenchService;
import com.rhn.shared.context.*;
import com.rhn.shared.json.JsonCodec;
import com.rhn.shared.api.BusinessException;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import java.time.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ResetDatabaseBeforeEachTestMethod
class DecisionObservationTest extends RhnIntegrationTestSupport {
    @org.springframework.test.context.bean.override.mockito.MockitoSpyBean DecisionObservationStore store;
    @Autowired DecisionObservationService observations;
    @Autowired TreatmentCatalogDecisionService catalog;
    @Autowired ClinicalTriageDecisionService triage;
    @Autowired MedicationWorkbenchService medications;
    @Autowired JdbcTemplate jdbc;
    @Autowired JsonCodec codec;
    @MockitoBean ExecutionContextProvider contexts;
    @MockitoBean ClinicalAiRuntimePolicy policy;
    @MockitoBean DecisionModelGateway gateway;
    @MockitoBean com.rhn.outpatient.triage.TriageAssessmentEngine baseline;
    private final Long t=Long.valueOf(TENANT),o=Long.valueOf(ORGANIZATION),d=Long.valueOf(DEPARTMENT);
    private ExecutionContext context(Long tenant,Long org,Long dept) {
        return new ExecutionContext(tenant,7L,"observer","correlation",Set.of("AI_CONFIGURATION.MANAGE","MASTER_DATA.MANAGE","OUTPATIENT_TRIAGE.ACCESS"),org,dept,"DEPARTMENT",Set.of(),Set.of());
    }
    @BeforeEach void setup() {
        when(contexts.requireCurrent()).thenReturn(context(t,o,d));
        when(policy.text(anyLong(),anyString(),anyString())).thenAnswer(c->c.getArgument(2));
        when(policy.number(anyLong(),anyString(),anyLong())).thenAnswer(c->c.getArgument(2));
        when(policy.booleanValue(anyLong(),anyString(),anyBoolean())).thenReturn(true);
        when(policy.secret(t,"decision-api-key",null)).thenReturn("synthetic-key");
    }
    private DecisionRun run(long id,String scene,String comparison,Boolean equal,int latency) {
        return new DecisionRun(id,scene,"SHADOW","SHADOW",Instant.now(),"correlation","trace-"+id,"synthetic-model","v1","hash",latency,.9,
                true,true,false,comparison,equal,codec.readTree("{\"state\":{\"chiefComplaint\":\"合成主诉\"}}"),codec.readTree("{}"),List.of("A"),List.of("A"),null);
    }
    private DecisionObservation list(int page,int size){return observations.list(null,null,null,null,null,page,size);}
    @Test void recordSnapshotsRequireClinicalAccessInAdditionToConfigurationPermission() {
        store.append(context(t,o,d),run(899,"RECORD_QUALITY","MANUAL_REVIEW",null,10));
        assertThatThrownBy(()->observations.detail(899L)).isInstanceOf(BusinessException.class)
                .extracting("code").isEqualTo("DECISION_OBSERVATION_RECORD_ACCESS");
        assertThatThrownBy(()->observations.review(899L,new DecisionReviewRequest("APPROPRIATE","合成研判")))
                .isInstanceOf(BusinessException.class).extracting("code").isEqualTo("DECISION_OBSERVATION_RECORD_ACCESS");
        when(contexts.requireCurrent()).thenReturn(new ExecutionContext(t,7L,"observer","c",Set.of("AI_CONFIGURATION.MANAGE","OUTPATIENT_RECEPTION.ACCESS"),o,d,"DEPARTMENT",Set.of(),Set.of()));
        assertThat(observations.detail(899L).run().input().toString()).contains("合成主诉");
        observations.review(899L,new DecisionReviewRequest("APPROPRIATE","包含临床资料的研判原因"));
        when(contexts.requireCurrent()).thenReturn(context(t,o,d));
        var row=list(0,20).records().content().stream().filter(r->r.id().equals(899L)).findFirst().orElseThrow();
        assertThat(row.review().verdict()).isEqualTo("APPROPRIATE");
        assertThat(row.review().reason()).isEmpty();
    }
    @Test void paginatesScopedRunsAndCountsOnlyComparableSamplesAndLatestReview() {
        store.append(context(t,o,d),run(801,"OUTPATIENT_TRIAGE","COMPARABLE",true,10));
        store.append(context(t,o,d),run(802,"PLAN_COMPILATION","MANUAL_REVIEW",null,30));
        store.append(context(t,o,99L),run(803,"OUTPATIENT_TRIAGE","COMPARABLE",false,100));
        store.append(context(98L,o,d),run(804,"OUTPATIENT_TRIAGE","COMPARABLE",false,100));
        var page=list(0,1);
        assertThat(page.records().totalElements()).isEqualTo(2);assertThat(page.records().totalPages()).isEqualTo(2);
        assertThat(page.records().content()).extracting(DecisionRow::id).containsExactly(802L);
        assertThat(page.statistics().modelCalls()).isEqualTo(2);assertThat(page.statistics().judged()).isEqualTo(2);
        assertThat(page.statistics().comparable()).isEqualTo(1);assertThat(page.statistics().equal()).isEqualTo(1);
        assertThat(page.statistics().averageLatencyMs()).isEqualTo(20);assertThat(page.statistics().p95LatencyMs()).isEqualTo(30);
        assertThat(list(1,1).records().content()).extracting(DecisionRow::id).containsExactly(801L);
        assertThatThrownBy(()->observations.detail(803L)).isInstanceOf(BusinessException.class);
        observations.review(802L,new DecisionReviewRequest("UNCERTAIN","合成资料不完整"));
        observations.review(802L,new DecisionReviewRequest("APPROPRIATE","补充研判"));
        assertThat(observations.detail(802L).reviews()).hasSize(2);
        assertThat(list(0,20).statistics().reviewed()).isEqualTo(1);
        assertThat(list(0,20).records().content().getFirst().review().verdict()).isEqualTo("APPROPRIATE");
        var only=observations.list("PLAN_COMPILATION","SHADOW","SHADOW",null,null,0,20);
        assertThat(only.statistics().total()).isEqualTo(1);
    }
    @Test void explainsEmptyStateAndRejectsInvalidFiltersAndMissingScope() {
        assertThat(list(0,20).scenes()).allMatch(s->s.state().equals("MODE_DISABLED"));
        when(policy.text(t,"decision-mode","DISABLED")).thenReturn("SHADOW");
        assertThat(list(0,20).scenes()).allMatch(s->s.state().equals("NOT_TRIGGERED"));
        when(policy.booleanValue(t,DecisionScene.OUTPATIENT_TRIAGE.settingKey(),false)).thenReturn(false);
        assertThat(list(0,20).scenes()).filteredOn(s->s.scene().equals("OUTPATIENT_TRIAGE")).allMatch(s->s.state().equals("SCENE_DISABLED"));
        when(policy.secret(t,"decision-api-key",null)).thenReturn(null);
        assertThat(list(0,20).scenes()).filteredOn(s->s.scene().equals("PLAN_COMPILATION")).allMatch(s->s.state().equals("CONFIGURATION_INCOMPLETE"));
        assertThatThrownBy(()->observations.list("FORGED",null,null,null,null,0,20)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(()->observations.list(null,null,null,Instant.now().minusSeconds(91*86400),Instant.now(),0,20)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(()->list(-1,20)).isInstanceOf(BusinessException.class);
        when(contexts.requireCurrent()).thenReturn(context(t,null,null));
        assertThatThrownBy(()->list(0,20)).isInstanceOf(BusinessException.class);
    }
    @Test void runtimePersistsShadowFailureAndHonestManualBaselineWithoutChangingBusinessOutput() {
        when(policy.text(t,"decision-mode","DISABLED")).thenReturn("SHADOW");
        when(gateway.decide(any(),any())).thenAnswer(c->{
            DecisionModelGateway.Request request=c.getArgument(0);var answers=new LinkedHashMap<String,DecisionModelGateway.ChoiceAnswer>();
            for(var q:request.questions()) {
                String choice=q.id().equals("department")?"DEPARTMENT_101":q.id().startsWith("intent_")?"EXAM|101":"PROVIDED";
                answers.put(q.id(),new DecisionModelGateway.ChoiceAnswer(choice,Map.of(choice,1d),.99));
            }
            return new DecisionModelGateway.Result("synthetic-trace","synthetic-model",answers,5);
        });
        var item=new TreatmentRecommendation("EXAM",101L,null,"A","合成项目",null,null);
        var attempt=catalog.match(List.of(new TreatmentCatalogDecisionService.Group(item,List.of(item))),context(t,o,d),DecisionScene.PLAN_COMPILATION);
        assertThat(attempt.applied()).isFalse();
        assertThat(list(0,20).records().content().getFirst().comparison()).isEqualTo("MANUAL_REVIEW");
        assertThat(list(0,20).records().content().getFirst().equal()).isNull();
        when(baseline.assess(any())).thenReturn(new BaselineAssessment(new RuleAssessment("LEVEL_4_NON_URGENT","合成规则",List.of(),List.of()),
                List.of(new DepartmentRecommendation(101L,"合成科室",90,"规则",1,null,true)),List.of(new CandidateDepartment(101L,"合成科室",1,true))));
        var input=new AssessmentRequest("合成主诉",null,null,null,null,null,null,null,null,null,null,30,"1",false);
        assertThat(triage.assess(input).department()).isNull();
        var row=list(0,20).records().content().getFirst();assertThat(row.comparison()).isEqualTo("COMPARABLE");assertThat(row.equal()).isTrue();
        assertThat(observations.detail(row.id()).run().input().toString()).contains("合成主诉");
        doAnswer(c->{
            DecisionModelGateway.Request request=c.getArgument(0);var answers=new LinkedHashMap<String,DecisionModelGateway.ChoiceAnswer>();
            for(var q:request.questions()) {String choice=q.id().equals("department")?"DEPARTMENT_101":"PROVIDED";answers.put(q.id(),new DecisionModelGateway.ChoiceAnswer(choice,Map.of(choice,.7),.7));}
            return new DecisionModelGateway.Result("uncertain-trace","synthetic-model",answers,5);
        }).when(gateway).decide(any(),any());
        triage.assess(input);
        assertThat(list(0,20).statistics().uncertain()).isEqualTo(1);
        assertThat(list(0,20).statistics().comparable()).isEqualTo(1);
        doThrow(new IllegalStateException("synthetic-provider-private-body")).when(gateway).decide(any(),any());
        triage.assess(input);
        var failed=list(0,20).records().content().getFirst();assertThat(failed.outcome()).isEqualTo("FAILED");
        assertThat(observations.detail(failed.id()).run().exceptionType()).isEqualTo("IllegalStateException");
        assertThat(codec.write(observations.detail(failed.id()))).doesNotContain("synthetic-provider-private-body");
    }
    @Test void recordingFailureDoesNotReplaceTheOriginalBusinessFallback() {
        when(policy.text(t,"decision-mode","DISABLED")).thenReturn("SHADOW");
        doThrow(new IllegalStateException("synthetic-storage-private-body")).when(store).append(any(),any());
        doThrow(new IllegalStateException("synthetic-provider-private-body")).when(gateway).decide(any(),any());
        var item=new TreatmentRecommendation("EXAM",101L,null,"A","合成项目",null,null);
        var attempt=catalog.match(List.of(new TreatmentCatalogDecisionService.Group(item,List.of(item))),context(t,o,d));
        assertThat(attempt.applied()).isFalse();assertThat(attempt.alerts()).isNotEmpty();
        verify(store).append(any(),any());assertThat(list(0,20).statistics().total()).isZero();
    }
    @Test void observationEndpointsEnforcePermissionsAndSerializeDetails() throws Exception {
        store.append(context(t,o,d),run(811,"OUTPATIENT_TRIAGE","COMPARABLE",true,10));
        mockMvc.perform(get("/api/ai/administration/decision-observations").with(rhnWorkContext())).andExpect(status().isOk()).andExpect(jsonPath("$.statistics.total").value(1));
        mockMvc.perform(get("/api/ai/administration/decision-observations/811").with(rhnWorkContext())).andExpect(status().isOk()).andExpect(jsonPath("$.run.id").value("811")).andExpect(jsonPath("$.run.input.state.chiefComplaint").value("合成主诉"));
        when(contexts.requireCurrent()).thenReturn(new ExecutionContext(t,7L,"config-only","test",Set.of("AI_CONFIGURATION.MANAGE"),o,d,"DEPARTMENT",Set.of(),Set.of()));
        mockMvc.perform(get("/api/ai/administration/decision-observations/811").with(rhnWorkContext())).andExpect(status().isForbidden());
        when(contexts.requireCurrent()).thenReturn(new ExecutionContext(t,7L,"restricted","test",Set.of(),o,d,"DEPARTMENT",Set.of(),Set.of()));
        mockMvc.perform(get("/api/ai/administration/decision-observations").with(rhnWorkContext())).andExpect(status().isForbidden());
    }
    @Test void medicationLogsPagePastFiftyAndScopeImmutableDetails() {
        var now=OffsetDateTime.now(ZoneOffset.UTC);
        for(long id=1001;id<=1055;id++) jdbc.update("""
            insert into RHN_AUD_MED_EVAL (ID_EVAL,ID_TNT,ID_RX,NO_TARGET_REV,ID_ENC,ID_PAT,ID_ORG,ID_DEPT,CD_INPUT_HASH,CD_RULE_SET_VER,CD_ENGINE_VER,SD_MODE,SD_DCSN,JSON_INPUT,JSON_RESULT,DT_STARTED,DT_CMPLD,ID_USER_ACTOR)
            values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,id,t,91L,0,92L,93L,o,id==1055?99L:d,"hash","synthetic-rule-set","v1","SHADOW","UNAVAILABLE","{\"age\":null}","{\"failureCodes\":[\"SYNTHETIC_MISSING_DATA\"]}",now,now,7L);
        var page=medications.evaluationPage("SHADOW","UNAVAILABLE",91L,null,null,2,20);
        assertThat(page.totalElements()).isEqualTo(54);assertThat(page.content()).hasSize(14);
        assertThat(medications.evaluationDetail(1001L).result().toString()).contains("SYNTHETIC_MISSING_DATA");
        assertThatThrownBy(()->medications.evaluationDetail(1055L)).isInstanceOf(BusinessException.class);
        when(contexts.requireCurrent()).thenReturn(context(98L,o,d));
        assertThat(medications.evaluationPage(null,null,null,null,null,0,20).totalElements()).isZero();
    }
}
