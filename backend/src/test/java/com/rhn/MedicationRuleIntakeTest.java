package com.rhn;

import com.rhn.quality.medication.api.MedicationRuleIntakeContracts.*;
import com.rhn.quality.medication.api.MedicationKnowledgeDraftContracts.Save;
import com.rhn.quality.medication.api.MedicationRuleAuthoringAi;
import com.rhn.quality.medication.application.*;
import com.rhn.shared.context.*;
import com.rhn.shared.json.JsonCodec;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.MediaType;
import java.util.*;
import static org.mockito.Mockito.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ResetDatabaseBeforeEachTestMethod
class MedicationRuleIntakeTest extends RhnIntegrationTestSupport {
    @Autowired MedicationRuleIntakeService intakes;
    @Autowired MedicationKnowledgeDraftService drafts;
    @Autowired MedicationKnowledgeRuleService rules;
    @Autowired JsonCodec json;
    @Autowired JdbcTemplate jdbc;
    @MockitoBean ExecutionContextProvider contexts;
    @MockitoBean MedicationRuleAuthoringAi ai;
    static final Long T=Long.valueOf(TENANT);
    static final String PATH="/api/quality/medication-rule-intakes";
    static final String NEED="所有药品单次用量超过3倍制剂规格用量时警告；同一处方重复用药，以及甲药与乙药的相互作用需要核对。";
    @BeforeEach void setup() {context(T,true);when(ai.status()).thenReturn(new MedicationRuleAuthoringAi.Status(true,"test-model","test"));}
    void context(Long tenant,boolean manage) {when(contexts.requireCurrent()).thenReturn(new ExecutionContext(tenant,7L,"需求作者","test",manage?Set.of("MASTER_DATA.MANAGE"):Set.of(),Long.valueOf(ORGANIZATION),Long.valueOf(DEPARTMENT),"DEPARTMENT",Set.of(),Set.of()));}
    Proposed intent(String kind,String quote) {return new Proposed(kind,"requirement",quote,"ALL_DRUGS","requirement","所有药品",List.of(),List.of("该需求的例外条件是什么？"));}
    Run analyze(Proposed... proposals) {when(ai.generate(anyString(),anyString(),eq(MedicationRuleIntakeService.PROMPT_VERSION))).thenReturn(json.write(new Output(List.of(proposals))));return intakes.analyze(new Request(NEED,null,List.of()));}
    @Test void global_dose_demand_is_kept_without_forcing_medication_selection_or_creating_a_rule() {
        var run=analyze(intent("SINGLE_DOSE","单次用量超过3倍制剂规格用量时警告"));
        var i=run.result().intents().getFirst();assertThat(i.scope()).isEqualTo("ALL_DRUGS");assertThat(i.capability().knowledgeWorkflow()).isFalse();assertThat(i.capability().prerequisites()).anyMatch(p->p.contains("制剂规格不是常规用量"));
        assertThat(run.result().status()).isEqualTo("ANALYZED");assertThat(intakes.get(run.id())).isEqualTo(run);
        assertThat(jdbc.queryForObject("select count(*) from RHN_AUD_KNOW_RULE",Integer.class)).isZero();assertThat(jdbc.queryForObject("select count(*) from RHN_AUD_MED_GOV",Integer.class)).isZero();assertThat(drafts.list("",0,20).content()).isEmpty();
        assertThatThrownBy(()->intakes.checkOrigin(T,run.id(),"DUPLICATE_THERAPY")).hasMessageContaining("没有可进入");
        var payload=org.mockito.ArgumentCaptor.forClass(String.class);verify(ai).generate(anyString(),payload.capture(),eq(MedicationRuleIntakeService.PROMPT_VERSION));
        assertThat(payload.getValue()).contains(NEED,"capabilities").doesNotContain("patientId","medicationSnapshot","prescriptionId");
    }
    @Test void multiple_intents_are_separate_and_only_supported_workflows_can_be_linked() {
        var run=analyze(intent("DUPLICATE_THERAPY","同一处方重复用药"),intent("DRUG_INTERACTION","甲药与乙药的相互作用"),intent("SINGLE_DOSE","单次用量"));
        assertThat(run.result().intents()).hasSize(3);assertThat(run.result().intents()).filteredOn(i->i.capability().knowledgeWorkflow()).hasSize(2);
        var saved=drafts.save(null,new Save(0,MedicationKnowledgeDraftModelTest.duplicate(),"人工核对后独立建草稿",null,run.id()));
        assertThat(saved.intakeId()).isEqualTo(run.id());assertThat(drafts.intakeOrigin(saved.saved().id(),1)).isEqualTo(run);
        assertThat(json.write(saved.saved())).doesNotContain("intakeId"); // Keep old immutable Version fingerprints stable.
        var preview=rules.preview(saved.saved().id(),1);var c=rules.create(saved.saved().id(),new com.rhn.quality.medication.api.MedicationKnowledgeRuleContracts.Create(1,preview.programHash(),"合成候选"));
        assertThat(c.knowledgeHash()).isEqualTo(MedicationKnowledgeReplayService.hash(json.write(saved.saved())));
        var second=drafts.save(saved.saved().id(),new Save(1,saved.saved().body(),"保留需求关联",null,run.id()));assertThat(second.intakeId()).isEqualTo(run.id());assertThat(drafts.intakeOrigin(saved.saved().id(),1)).isEqualTo(run);
    }
    @Test void quotes_and_enum_values_are_checked_and_unknown_scope_never_becomes_all() {
        var invalid=new Proposed("DUPLICATE_THERAPY","requirement","重复用药","ALL_DRUGS","requirement","重复用药",List.of(new Quoted("POPULATION","requirement","不存在的人群"),new Quoted("CODE","requirement","同一处方"),new Quoted("CONTEXT","requirement","同一处方")),List.of());
        var run=analyze(invalid,intent("GENERATE_SQL","同一处方"),intent("DRUG_INTERACTION","虚构的原文"));
        assertThat(run.result().intents()).singleElement().satisfies(i->{assertThat(i.scope()).isEqualTo("UNSPECIFIED");assertThat(i.scopeCitation()).isNull();assertThat(i.conditions()).singleElement().satisfies(c->assertThat(c.citation().quote()).isEqualTo("同一处方"));});
        assertThat(run.result().questions()).anyMatch(q->"SYSTEM".equals(q.origin()));assertThat(run.result().notes()).anyMatch(n->n.contains("已忽略"));
        var quote=run.result().intents().getFirst().citation();assertThat(NEED.substring(quote.start(),quote.end())).isEqualTo(quote.quote());
    }
    @Test void clarification_pins_parent_question_and_cites_answers_without_overwriting_original() {
        var parent=analyze(intent("DUPLICATE_THERAPY","重复用药"));var q=parent.result().questions().getFirst();
        when(ai.generate(anyString(),anyString(),anyString())).thenReturn(json.write(new Output(List.of(new Proposed("DUPLICATE_THERAPY","requirement","重复用药","NAMED_DRUGS","answer:1","仅指定药品",List.of(new Quoted("EXCEPTION","answer:1","仅指定药品")),List.of())))));
        var next=intakes.analyze(new Request(NEED,parent.id(),List.of(new Answer(q.id(),"仅指定药品"))));
        assertThat(next.parentId()).isEqualTo(parent.id());assertThat(next.input().clarifications()).singleElement().satisfies(c->{assertThat(c.analysisId()).isEqualTo(parent.id());assertThat(c.question()).isEqualTo(q.text());});
        assertThat(next.result().intents().getFirst().scopeCitation().source()).isEqualTo("answer:1");assertThat(intakes.get(parent.id())).isEqualTo(parent);assertThat(intakes.history(0).totalElements()).isEqualTo(2);
        when(ai.generate(anyString(),anyString(),anyString())).thenThrow(new IllegalStateException("retryable"));
        var failed=intakes.analyze(new Request(NEED,parent.id(),List.of(new Answer(q.id(),"仅指定药品"))));
        doReturn(json.write(new Output(List.of(intent("DUPLICATE_THERAPY","重复用药"))))).when(ai).generate(anyString(),anyString(),anyString());
        var retried=intakes.analyze(new Request(NEED,failed.id(),List.of()));assertThat(retried.input()).isEqualTo(failed.input());assertThat(retried.parentId()).isEqualTo(failed.id());
        assertThatThrownBy(()->intakes.analyze(new Request("变更需求",parent.id(),List.of(new Answer(q.id(),"回答"))))).hasMessageContaining("原需求已改变");
        assertThatThrownBy(()->intakes.analyze(new Request(NEED,parent.id(),List.of(new Answer("unknown","回答"))))).hasMessageContaining("不属于");
        assertThatThrownBy(()->intakes.analyze(new Request(NEED,parent.id(),List.of(new Answer(q.id(),"a"),new Answer(q.id(),"b"))))).hasMessageContaining("只回答一次");
    }
    @Test void invalid_output_and_provider_errors_are_audited_without_claiming_success() {
        when(ai.generate(anyString(),anyString(),anyString())).thenReturn("{broken");var broken=intakes.analyze(new Request(NEED,null,List.of()));assertThat(broken.result().status()).isEqualTo("INVALID_OUTPUT");assertThat(broken.rawOutput()).isEqualTo("{broken");
        when(ai.generate(anyString(),anyString(),anyString())).thenThrow(new IllegalStateException("private upstream detail"));var failure=intakes.analyze(new Request(NEED,null,List.of()));assertThat(failure.result().status()).isEqualTo("MODEL_ERROR");assertThat(json.write(failure)).doesNotContain("private upstream detail");
        assertThat(intakes.history(0).totalElements()).isEqualTo(2);assertThatThrownBy(()->intakes.checkOrigin(T,broken.id(),"DUPLICATE_THERAPY")).hasMessageContaining("没有可进入");
        when(ai.status()).thenReturn(new MedicationRuleAuthoringAi.Status(false,"","disabled"));assertThatThrownBy(()->intakes.analyze(new Request(NEED,null,List.of()))).hasMessageContaining("暂不可用");
    }
    @Test void oversized_output_is_bounded_and_no_unquoted_derived_parameters_are_adopted() {
        when(ai.generate(anyString(),anyString(),anyString())).thenReturn("x".repeat(61000));var huge=intakes.analyze(new Request(NEED,null,List.of()));assertThat(huge.rawOutput()).hasSize(60000);assertThat(huge.rawTruncated()).isTrue();assertThat(huge.result().status()).isEqualTo("INVALID_OUTPUT");
        assertThatThrownBy(()->intakes.analyze(new Request("x".repeat(4001),null,List.of()))).hasMessageContaining("4000");
        assertThatThrownBy(()->intakes.analyze(new Request(NEED,null,List.of(new Answer("Q1","x"))))).hasMessageContaining("必须关联");
    }
    @Test void integrity_tenant_permissions_version_provenance_and_http_boundaries_apply() throws Exception {
        var run=analyze(intent("DUPLICATE_THERAPY","重复用药"));var saved=drafts.save(null,new Save(0,MedicationKnowledgeDraftModelTest.duplicate(),"test",null,run.id()));
        mockMvc.perform(get(PATH+"/"+run.id()).with(rhnWorkContext())).andExpect(status().isOk()).andExpect(jsonPath("$.result.status").value("ANALYZED"));
        mockMvc.perform(get(PATH+"/capabilities").with(rhnWorkContext())).andExpect(status().isOk());
        mockMvc.perform(get("/api/quality/medication-knowledge-drafts/"+saved.saved().id()+"/versions/1/intake-origin").with(rhnWorkContext())).andExpect(status().isOk()).andExpect(jsonPath("$.id").value(run.id().toString()));
        mockMvc.perform(get(PATH).header("X-Tenant-Id",TENANT)).andExpect(status().isUnauthorized());
        context(9999L,true);assertThat(intakes.history(0).content()).isEmpty();assertThatThrownBy(()->intakes.get(run.id())).hasMessageContaining("当前租户");assertThatThrownBy(()->drafts.intakeOrigin(saved.saved().id(),1)).hasMessageContaining("当前租户");
        context(T,false);assertThatThrownBy(()->intakes.capabilities()).hasMessageContaining("权限");context(T,true);assertThatThrownBy(()->intakes.history(-1)).hasMessageContaining("分页");
        jdbc.update("update RHN_AUD_KNOW_INTAKE set JSON_RUN=? where ID_TNT=? and ID_INTAKE=?",json.write(run).replace("仅分析用","坏指纹").replace("同一处方重复用药","篡改需求"),T,run.id());
        assertThatThrownBy(()->intakes.get(run.id())).hasMessageContaining("指纹不一致");
    }
}
