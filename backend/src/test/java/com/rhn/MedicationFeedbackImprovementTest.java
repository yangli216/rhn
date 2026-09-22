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
class MedicationFeedbackImprovementTest extends RhnIntegrationTestSupport {
    @Autowired MedicationFeedbackImprovementService improvements;
    @Autowired MedicationRuleIntakeService intakes;
    @MockitoBean com.rhn.quality.medication.api.MedicationRuleAuthoringAi ai;
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

    static final String NEED="请核查同一处方重复用药的例外条件";
    void model() {
        when(ai.status()).thenReturn(new com.rhn.quality.medication.api.MedicationRuleAuthoringAi.Status(true,"isolated-model","test"));
        doReturn(output()).when(ai).generate(anyString(),anyString(),anyString());
    }
    String output() {return "{\"intents\":[{\"kind\":\"DUPLICATE_THERAPY\",\"source\":\"requirement\",\"quote\":\"重复用药\",\"scope\":\"UNSPECIFIED\",\"conditions\":[],\"questions\":[\"具体例外是什么？\"]}]}";}
    com.rhn.quality.medication.api.MedicationRuleIntakeContracts.ImprovementRequest request() {
        var d=detail();return new com.rhn.quality.medication.api.MedicationRuleIntakeContracts.ImprovementRequest(new com.rhn.quality.medication.api.MedicationRuleIntakeContracts.Request(NEED,null,List.of()),d.latest().id(),d.basis().fingerprint(),true);
    }
    com.rhn.quality.medication.api.MedicationRuleIntakeContracts.Run analyze() {return improvements.analyze(candidate.id(),deployment.id(),runId,request());}
    long count() {return jdbc.queryForObject("select count(*) from RHN_AUD_KNOW_INTAKE",Long.class);}
    @Test void feedback_to_intent_to_new_knowledge_version_keeps_evidence_separate_and_execution_unchanged() throws Exception {
        model();var d=record("FALSE_POSITIVE");var before=governance.read(T,"KNOWLEDGE:"+candidate.knowledgeId());var run=analyze();
        assertThat(run.result().status()).isEqualTo("ANALYZED");
        var origin=intakes.feedbackOrigin(run.id());assertThat(origin.feedback()).isEqualTo(d.latest());assertThat(origin.knowledgeId()).isEqualTo(candidate.knowledgeId());assertThat(origin.knowledgeVersion()).isEqualTo(1);
        var body=drafts.detail(candidate.knowledgeId()).saved().body();
        var next=drafts.save(candidate.knowledgeId(),new com.rhn.quality.medication.api.MedicationKnowledgeDraftContracts.Save(1,body,"针对反馈人工核对后保存合成版本",null,run.id()));
        assertThat(next.saved().version()).isEqualTo(2);assertThat(next.saved().body().evidence()).isEqualTo(candidate.knowledge().body().evidence());assertThat(drafts.intakeOrigin(candidate.knowledgeId(),2)).isEqualTo(run);
        assertThat(governance.read(T,"KNOWLEDGE:"+candidate.knowledgeId())).isEqualTo(before);assertThat(detail().latest()).isEqualTo(d.latest());
        var payload=org.mockito.ArgumentCaptor.forClass(String.class);verify(ai).generate(anyString(),payload.capture(),anyString());
        assertThat(payload.getValue()).contains(NEED).doesNotContain("prescriptionId","knowledgeInput","runHash",d.latest().assessment(),d.latest().evidence());
        mockMvc.perform(get("/api/quality/medication-rule-intakes/"+run.id()+"/feedback-origin").with(rhnWorkContext())).andExpect(status().isOk()).andExpect(jsonPath("$.feedback.id").value(d.latest().id().toString()));
        withdraw();assertThat(intakes.feedbackOrigin(run.id())).isEqualTo(origin);
    }
    @Test void confirmation_latest_opinion_and_material_are_required_before_calling_model() {
        model();record("RULE_ISSUE");var cmd=request();
        assertThatThrownBy(()->improvements.analyze(candidate.id(),deployment.id(),runId,new com.rhn.quality.medication.api.MedicationRuleIntakeContracts.ImprovementRequest(cmd.intake(),cmd.feedbackId(),cmd.expectedBasisHash(),false))).hasMessageContaining("明确确认");
        record("DATA_ISSUE");assertThatThrownBy(()->improvements.analyze(candidate.id(),deployment.id(),runId,cmd)).hasMessageContaining("已变化");
        record("SUPPORTED");assertThatThrownBy(this::analyze).hasMessageContaining("有效意见");
        withdraw();assertThatThrownBy(this::analyze).hasMessageContaining("有效意见");
        verify(ai,never()).generate(anyString(),anyString(),anyString());assertThat(count()).isZero();
    }
    @Test void changed_feedback_during_model_latency_does_not_persist_a_stale_analysis() {
        model();record("RULE_ISSUE");var cmd=request();
        when(ai.generate(anyString(),anyString(),anyString())).thenAnswer(inv->{record("UNCERTAIN");return output();});
        assertThatThrownBy(()->improvements.analyze(candidate.id(),deployment.id(),runId,cmd)).hasMessageContaining("已变化");assertThat(count()).isZero();
    }
    @Test void clarification_inherits_exact_origin_and_cannot_use_generic_or_other_feedback_parent() {
        model();record("FALSE_POSITIVE");var run=analyze();var cmd=request();var question=run.result().questions().getFirst();
        var child=new com.rhn.quality.medication.api.MedicationRuleIntakeContracts.Request(NEED,run.id(),List.of(new com.rhn.quality.medication.api.MedicationRuleIntakeContracts.Answer(question.id(),"仅核查指定范围，待提供依据")));
        var next=improvements.analyze(candidate.id(),deployment.id(),runId,new com.rhn.quality.medication.api.MedicationRuleIntakeContracts.ImprovementRequest(child,cmd.feedbackId(),cmd.expectedBasisHash(),true));
        assertThat(improvements.history(candidate.id(),deployment.id(),runId,0).totalElements()).isEqualTo(2);assertThat(next.parentId()).isEqualTo(run.id());assertThat(intakes.feedbackOrigin(next.id())).isEqualTo(intakes.feedbackOrigin(run.id()));
        assertThatThrownBy(()->intakes.analyze(child)).hasMessageContaining("原反馈");
        record("RULE_ISSUE");var changed=request();assertThatThrownBy(()->improvements.analyze(candidate.id(),deployment.id(),runId,new com.rhn.quality.medication.api.MedicationRuleIntakeContracts.ImprovementRequest(child,changed.feedbackId(),changed.expectedBasisHash(),true))).hasMessageContaining("不属于");
    }
    @Test void scope_permissions_and_corrupt_origin_are_enforced_for_reads_history_and_draft_linking() throws Exception {
        model();record("RULE_ISSUE");var run=analyze();assertThat(intakes.history(0).totalElements()).isEqualTo(1);
        when(contexts.requireCurrent()).thenReturn(new ExecutionContext(T,8L,"other","test",Set.of("MASTER_DATA.MANAGE"),O,D+1,"DEPARTMENT",Set.of(),Set.of()));
        assertThat(intakes.history(0).totalElements()).isZero();assertThatThrownBy(()->intakes.get(run.id())).hasMessageContaining("未找到");assertThatThrownBy(()->intakes.checkOrigin(T,run.id(),"DUPLICATE_THERAPY")).hasMessageContaining("未找到");assertThatThrownBy(this::analyze).isInstanceOf(BusinessException.class);
        context(T+1,8L,true);assertThatThrownBy(()->intakes.feedbackOrigin(run.id())).hasMessageContaining("未找到");
        context(T,8L,false);assertThatThrownBy(()->intakes.get(run.id())).hasMessageContaining("权限");
        context(T,8L,true);jdbc.update("update RHN_AUD_KNOW_INTAKE set HASH_ORIGIN=? where ID_TNT=? and ID_INTAKE=?","bad",T,run.id());
        assertThatThrownBy(()->intakes.get(run.id())).hasMessageContaining("指纹不一致");
        mockMvc.perform(post(path()+"/improvement-intakes").header("X-Tenant-Id",TENANT).contentType(MediaType.APPLICATION_JSON).content(json.write(request()))).andExpect(status().isUnauthorized());
    }
    @Test void failures_remain_auditable_and_atomic_rollback_keeps_no_partial_origin() {
        model();record("UNCERTAIN");when(ai.generate(anyString(),anyString(),anyString())).thenThrow(new IllegalStateException("test failure"));
        var failed=analyze();assertThat(failed.result().status()).isEqualTo("MODEL_ERROR");assertThat(intakes.feedbackOrigin(failed.id())).isNotNull();
        model();var cmd=request();var retry=new com.rhn.quality.medication.api.MedicationRuleIntakeContracts.Request(NEED,failed.id(),List.of());
        var success=improvements.analyze(candidate.id(),deployment.id(),runId,new com.rhn.quality.medication.api.MedicationRuleIntakeContracts.ImprovementRequest(retry,cmd.feedbackId(),cmd.expectedBasisHash(),true));assertThat(success.result().status()).isEqualTo("ANALYZED");
        long before=count();new TransactionTemplate(transactions).executeWithoutResult(status->{analyze();status.setRollbackOnly();});assertThat(count()).isEqualTo(before);
    }
}

