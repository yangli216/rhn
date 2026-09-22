package com.rhn;

import com.rhn.quality.medication.api.MedicationKnowledgeReviewContracts.*;
import com.rhn.quality.medication.api.MedicationKnowledgeRuleContracts.KnowledgeRuleCandidate;
import com.rhn.quality.medication.api.MedicationKnowledgeRuleContracts.Create;
import com.rhn.quality.medication.api.MedicationKnowledgeTestContracts.*;
import com.rhn.quality.medication.api.MedicationKnowledgeDraftContracts.Row;
import com.rhn.quality.medication.api.MedicationRuleCatalogContracts.Deployment;
import com.rhn.quality.medication.api.MedicationKnowledgeFeedbackContracts.Detail;
import com.rhn.quality.medication.application.*;
import com.rhn.quality.medication.infrastructure.*;
import com.rhn.shared.context.*;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.json.JsonCodec;
import com.rhn.outpatient.api.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.util.*;
import java.time.*;
import java.util.concurrent.*;
import static com.rhn.MedicationKnowledgeDraftModelTest.*;
import static org.mockito.Mockito.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ResetDatabaseBeforeEachTestMethod
class MedicationKnowledgeFeedbackTest extends RhnIntegrationTestSupport {
    @Autowired MedicationKnowledgeFeedbackService feedback;
    @Autowired MedicationKnowledgeDeploymentService deployments;
    @Autowired MedicationRuleRuntime runtime;
    @Autowired MedicationRuleGovernanceStore governance;
    @Autowired MedicationKnowledgeReviewService reviews;
    @Autowired MedicationKnowledgeRuleService rules;
    @Autowired MedicationKnowledgeDraftService drafts;
    @Autowired MedicationKnowledgeTestService tests;
    @Autowired JsonCodec json;
    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager transactions;
    @MockitoBean ExecutionContextProvider contexts;
    static final Long T=Long.valueOf(TENANT),O=Long.valueOf(ORGANIZATION),D=Long.valueOf(DEPARTMENT);
    KnowledgeRuleCandidate candidate;Deployment deployment;Long runId;
    @BeforeEach void setup() {context(T,7L,true);candidate=createCandidate();ready(candidate);approve(candidate);deployment=deploy(candidate);runId=observe(item(1),item(2));}
    void context(Long tenant,Long actor,boolean manage) {when(contexts.requireCurrent()).thenReturn(new ExecutionContext(tenant,actor,"reviewer-"+actor,"test",manage?Set.of("MASTER_DATA.MANAGE"):Set.of(),Long.valueOf(ORGANIZATION),Long.valueOf(DEPARTMENT),"DEPARTMENT",Set.of(),Set.of()));}
    KnowledgeRuleCandidate createCandidate() {var source=drafts.save(null,new com.rhn.quality.medication.api.MedicationKnowledgeDraftContracts.Save(0,duplicate(),"合成知识"));var p=rules.preview(source.saved().id(),1);return rules.create(source.saved().id(),new Create(1,p.programHash(),"合成候选"));}
    Case fixture(String title,String expected,List<String> ids,Row... rows) {return new Case(title,"人工先定义预期的合成测试，非临床依据",new FixtureInput(null,null,null,List.of(rows)),expected,ids);}
    SuiteDetail suite(KnowledgeRuleCandidate c,int expectedVersion,boolean complete) {var a=row("A","E1","S1","PO");var b=row("B","E1","S1","PO");var cases=new ArrayList<Case>();cases.add(fixture("正例","MATCH",List.of("A","B"),a,b));if(complete){cases.add(fixture("反例","NO_MATCH",List.of(),a));cases.add(fixture("缺失","UNAVAILABLE",List.of(),new Row("X",null,null,null,null,null,null,"ACTIVE")));}return tests.save(c.id(),new Save(expectedVersion,c.programHash(),"独立预期",cases));}
    void ready(KnowledgeRuleCandidate c) {var s=suite(c,0,true);tests.execute(c.id(),new Execute(1,s.suiteHash(),"执行合成样例"));}
    Command command(Preview p,String op) {return new Command(p.revision(),op,"SUBMIT".equals(op)?p.current().fingerprint():p.submission().basis().fingerprint(),"合成审核操作","WARN","REQUIRE_OVERRIDE",true,true,true,"仅验证审核留痕，不构成临床批准材料");}
    Deployment deploy(KnowledgeRuleCandidate c) {var p=deployments.preview(c.id());return deployments.command(c.id(),new com.rhn.quality.medication.api.MedicationKnowledgeDeploymentContracts.Command(p.revision(),"DEPLOY","SHADOW",p.approval()==null?null:p.approval().basis().fingerprint(),null,null,"合成旁路验证"));}
    void approve(KnowledgeRuleCandidate c) {reviews.command(c.id(),command(reviews.preview(c.id()),"SUBMIT"));context(T,8L,true);reviews.command(c.id(),command(reviews.preview(c.id()),"APPROVE"));}
    void pause(KnowledgeRuleCandidate c,Deployment d) {deployments.command(c.id(),new com.rhn.quality.medication.api.MedicationKnowledgeDeploymentContracts.Command(deployments.preview(c.id()).revision(),"PAUSE","SHADOW",null,d.id(),null,"暂停合成旁路"));}
    PrescriptionSafetySnapshot.MedicationItem item(long id,String catalog,String edition,String hash,String entry,String spec,String status) {
        var ref=Map.of("status","LINKED","catalogId",catalog,"catalogVersion",edition,"contentHash",hash,"entryId",entry,"specificationId",spec);
        var sem=Map.of("schemaVersion","qmed-medication-semantics-v1","medicationId",100L,"status","VERSIONED_PARTIAL","medicationSemanticVersion","b".repeat(64),"standardReference",ref);
        return new PrescriptionSafetySnapshot.MedicationItem(id,1,100L,null,null,status,"VERSIONED_PARTIAL",null,null,null,null,"NONE","UNMAPPED",null,null,null,null,null,json.write(Map.of("id",100L,"name","冻结合成药品","clinicalSemantics",sem)),null,null);
    }
    PrescriptionSafetySnapshot.MedicationItem item(long id) {return item(id,"C","1","a".repeat(64),"E","S","ACTIVE");}
    PrescriptionSafetySnapshot snapshot(Long department,PrescriptionSafetySnapshot.MedicationItem... rows) {
        return new PrescriptionSafetySnapshot(PrescriptionSafetySnapshot.SCHEMA_VERSION,T,1000L,2,2000L,3000L,O,department,"DRAFT",List.of(rows),new PrescriptionSafetySnapshot.PatientSafetyContext(true,true,null,List.of(),30,"UNKNOWN"),new PrescriptionSafetySnapshot.EvaluationTiming(LocalDate.of(2026,1,10),"Asia/Shanghai"));
    }

    Long observe(PrescriptionSafetySnapshot.MedicationItem... items) {
        var input=snapshot(D,items);runtime.evaluate(input,runtime.plan(input,List.of(),Instant.now()).shadow(),Instant.now());
        return deployments.observations(candidate.id(),deployment.id(),0).records().content().getFirst().id();
    }
    Detail detail() {return feedback.detail(candidate.id(),deployment.id(),runId,0);}
    com.rhn.quality.medication.api.MedicationKnowledgeFeedbackContracts.Command record(Detail view,String verdict) {
        return new com.rhn.quality.medication.api.MedicationKnowledgeFeedbackContracts.Command(view.latest()==null?0:view.latest().revision(),view.basis().fingerprint(),"RECORD",verdict,"合成研判说明，不代表临床结论","合成事实与样例定位，非医学证据","建议核查适用范围","新增或更正合成意见");
    }
    Detail record(String verdict) {return feedback.command(candidate.id(),deployment.id(),runId,record(detail(),verdict));}
    Detail withdraw() {var d=detail();return feedback.command(candidate.id(),deployment.id(),runId,new com.rhn.quality.medication.api.MedicationKnowledgeFeedbackContracts.Command(d.latest().revision(),d.basis().fingerprint(),"WITHDRAW",null,null,null,null,"撤回合成意见"));}
    String path() {return "/api/quality/medication-knowledge-rule-candidates/"+candidate.id()+"/deployments/"+deployment.id()+"/observations/"+runId+"/feedback";}
    @Test void feedback_binds_frozen_runtime_facts_and_never_changes_rule_or_prescription_behavior() {
        var before=governance.read(T,"KNOWLEDGE:"+candidate.knowledgeId());var raw=jdbc.queryForObject("select JSON_RUN from RHN_AUD_MED_GOV_RUN where ID_RULE_RUN=?",String.class,runId);
        var d=detail();assertThat(d.gaps()).isEmpty();assertThat(d.observation().outcome()).isEqualTo("MATCH");
        assertThat(d.input().items()).hasSize(2);assertThat(d.frozenCandidate()).isEqualTo(candidate);
        var saved=record("FALSE_POSITIVE");assertThat(saved.latest().basis().runId()).isEqualTo(runId);assertThat(saved.latest().basis().programHash()).isEqualTo(candidate.programHash());
        assertThat(saved.latest().actorId()).isEqualTo(8L);assertThat(saved.history().content()).hasSize(1);
        assertThat(governance.read(T,"KNOWLEDGE:"+candidate.knowledgeId())).isEqualTo(before);
        assertThat(jdbc.queryForObject("select JSON_RUN from RHN_AUD_MED_GOV_RUN where ID_RULE_RUN=?",String.class,runId)).isEqualTo(raw);
        drafts.save(candidate.knowledgeId(),new com.rhn.quality.medication.api.MedicationKnowledgeDraftContracts.Save(1,duplicate(),"新知识草稿不改历史"));pause(candidate,deployment);
        var historical=detail();assertThat(historical.frozenCandidate()).isEqualTo(candidate);assertThat(historical.basis()).isEqualTo(d.basis());
        assertThat(record("RULE_ISSUE").latest().revision()).isEqualTo(2);
    }
    @Test void verdicts_respect_outcomes_and_unavailable_is_not_a_negative_case() {
        assertThatThrownBy(()->record("POSSIBLE_MISS")).hasMessageContaining("相符的研判分类");
        runId=observe(item(1));assertThat(detail().allowedVerdicts()).contains("POSSIBLE_MISS").doesNotContain("FALSE_POSITIVE");
        assertThat(record("POSSIBLE_MISS").latest().verdict()).isEqualTo("POSSIBLE_MISS");
        var bad=new PrescriptionSafetySnapshot.MedicationItem(2L,1,100L,null,null,"ACTIVE","LEGACY",null,null,null,null,null,"UNMAPPED",null,null,null,null,null,"{}",null,null);
        runId=observe(item(1),bad);assertThat(detail().observation().outcome()).isEqualTo("UNAVAILABLE");
        assertThat(detail().allowedVerdicts()).doesNotContain("FALSE_POSITIVE","POSSIBLE_MISS");
        assertThatThrownBy(()->record("POSSIBLE_MISS")).hasMessageContaining("相符的研判分类");assertThat(record("DATA_ISSUE").latest().verdict()).isEqualTo("DATA_ISSUE");
        assertThat(deployments.observations(candidate.id(),deployment.id(),0).counts()).containsEntry("MATCH",1L).containsEntry("NO_MATCH",1L).containsEntry("UNAVAILABLE",1L);
    }
    @Test void corrections_withdrawals_and_full_summary_count_only_latest_opinion_per_observation() {
        var first=record("SUPPORTED").latest();context(T,9L,true);
        assertThat(detail().canWithdraw()).isFalse();assertThatThrownBy(this::withdraw).hasMessageContaining("记录人");
        var corrected=record("RULE_ISSUE");assertThat(corrected.latest().revision()).isEqualTo(2);assertThat(corrected.history().content().get(1)).isEqualTo(first);
        Long reviewedRun=runId;for(int i=0;i<22;i++)observe(item(1));
        var all=deployments.observations(candidate.id(),deployment.id(),1);assertThat(all.records().totalElements()).isEqualTo(23);assertThat(all.feedback().recorded()).isEqualTo(1);assertThat(all.feedback().pending()).isEqualTo(22);assertThat(all.feedback().verdicts()).containsEntry("RULE_ISSUE",1L).containsEntry("SUPPORTED",0L);
        assertThat(all.records().content()).filteredOn(o->o.id().equals(reviewedRun)).singleElement().satisfies(o->assertThat(o.feedback().revision()).isEqualTo(2));
        var withdrawn=withdraw();assertThat(withdrawn.latest().operation()).isEqualTo("WITHDRAW");assertThat(withdrawn.history().content()).hasSize(3);assertThat(withdrawn.canWithdraw()).isFalse();
        assertThat(deployments.observations(candidate.id(),deployment.id(),0).feedback().pending()).isEqualTo(23);
        for(int i=0;i<19;i++)record("UNCERTAIN");
        assertThat(feedback.detail(candidate.id(),deployment.id(),runId,1).history().content()).hasSize(2);
        assertThat(detail().history().totalElements()).isEqualTo(22);assertThat(deployments.observations(candidate.id(),deployment.id(),0).feedback().verdicts()).containsEntry("UNCERTAIN",1L);
    }
    @Test void cross_scope_candidate_deployment_actor_and_http_boundaries_are_enforced() throws Exception {
        mockMvc.perform(get(path()).with(rhnWorkContext())).andExpect(status().isOk()).andExpect(jsonPath("$.observation.outcome").value("MATCH"));
        mockMvc.perform(post(path()).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(json.write(record(detail(),"UNCERTAIN"))))
            .andExpect(status().isOk()).andExpect(jsonPath("$.latest.revision").value(1));
        mockMvc.perform(get(path()).header("X-Tenant-Id",TENANT)).andExpect(status().isUnauthorized());
        mockMvc.perform(get(path()).with(rhnWorkContext()).param("page","-1")).andExpect(status().isBadRequest());
        var another=deploy(candidate);assertThatThrownBy(()->feedback.detail(candidate.id(),another.id(),runId,0)).hasMessageContaining("未找到");
        assertThatThrownBy(()->feedback.detail(999L,deployment.id(),runId,0)).hasMessageContaining("当前租户");
        when(contexts.requireCurrent()).thenReturn(new ExecutionContext(T,8L,"其他科室","test",Set.of("MASTER_DATA.MANAGE"),O,999L,"DEPARTMENT",Set.of(),Set.of()));
        assertThatThrownBy(this::detail).hasMessageContaining("当前机构科室");
        context(999L,8L,true);assertThatThrownBy(this::detail).hasMessageContaining("当前租户");
        context(T,null,true);assertThatThrownBy(this::detail).hasMessageContaining("操作者身份");
        context(T,8L,false);assertThatThrownBy(this::detail).hasMessageContaining("权限");
    }
    @Test void stale_requests_concurrent_recording_and_transaction_rollback_preserve_history() throws Exception {
        var input=record(detail(),"SUPPORTED");var gate=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(2)) {
            Callable<String> task=()->{gate.await();try{feedback.command(candidate.id(),deployment.id(),runId,input);return "RECORDED";}catch(BusinessException e){return e.code();}};
            var a=pool.submit(task);var b=pool.submit(task);gate.countDown();assertThat(List.of(a.get(20,TimeUnit.SECONDS),b.get(20,TimeUnit.SECONDS))).containsExactlyInAnyOrder("RECORDED","QMED_FEEDBACK_STALE");
        }
        assertThat(detail().history().totalElements()).isEqualTo(1);
        new TransactionTemplate(transactions).executeWithoutResult(tx->{record("UNCERTAIN");tx.setRollbackOnly();});
        assertThat(detail().history().totalElements()).isEqualTo(1);
        var d=detail();assertThatThrownBy(()->feedback.command(candidate.id(),deployment.id(),runId,new com.rhn.quality.medication.api.MedicationKnowledgeFeedbackContracts.Command(1,"wrong","RECORD","SUPPORTED","说明","依据",null,"原因"))).hasMessageContaining("已变化");
        assertThatThrownBy(()->feedback.command(candidate.id(),deployment.id(),runId,new com.rhn.quality.medication.api.MedicationKnowledgeFeedbackContracts.Command(1,d.basis().fingerprint(),"RECORD",null,"说明","依据",null,"原因"))).hasMessageContaining("相符的研判分类");
        assertThatThrownBy(()->feedback.command(candidate.id(),deployment.id(),runId,new com.rhn.quality.medication.api.MedicationKnowledgeFeedbackContracts.Command(1,d.basis().fingerprint(),"RECORD","SUPPORTED","说明","",null,"原因"))).hasMessageContaining("研判说明与依据");
    }
    @Test void missing_frozen_facts_and_changed_runtime_or_feedback_snapshots_never_masquerade_as_complete() {
        var raw=(tools.jackson.databind.node.ObjectNode)json.readTree(jdbc.queryForObject("select JSON_RUN from RHN_AUD_MED_GOV_RUN where ID_RULE_RUN=?",String.class,runId));
        var details=(tools.jackson.databind.node.ObjectNode)json.readTree(raw.path("details").asString());details.putNull("knowledgeInput");raw.put("details",json.write(details));
        jdbc.update("update RHN_AUD_MED_GOV_RUN set JSON_RUN=? where ID_RULE_RUN=?",json.write(raw),runId);
        assertThat(detail().gaps()).anyMatch(g->g.contains("最小评价事实"));assertThat(detail().allowedVerdicts()).containsExactly("DATA_ISSUE","RULE_ISSUE","UNCERTAIN");
        var first=record("DATA_ISSUE");raw.put("decision","PASS");jdbc.update("update RHN_AUD_MED_GOV_RUN set JSON_RUN=? where ID_RULE_RUN=?",json.write(raw),runId);
        assertThat(detail().allowedVerdicts()).isEmpty();assertThat(detail().gaps()).anyMatch(g->g.contains("既有研判引用"));
        assertThatThrownBy(()->record("SUPPORTED")).hasMessageContaining("相符的研判分类");
        jdbc.update("update RHN_AUD_KNOW_FEEDBACK set HASH_EVENT='corrupt' where ID_FDBK=?",first.latest().id());
        assertThatThrownBy(this::detail).hasMessageContaining("研判历史指纹");
        assertThatThrownBy(()->deployments.observations(candidate.id(),deployment.id(),0)).hasMessageContaining("研判历史指纹");
    }
}
