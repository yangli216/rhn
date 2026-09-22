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
class MedicationKnowledgePublicationTest extends RhnIntegrationTestSupport {
    @Autowired MedicationKnowledgeFeedbackService feedback;
    @Autowired MedicationKnowledgePublicationService publication;
    @Autowired MedicationKnowledgePublicationStore publicationStore;
    @Autowired MedicationSafetyAdapter safety;
    @Autowired com.rhn.platform.identityaccess.api.IdentityAccessDirectory identities;
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
    String unavailableAction="REQUIRE_OVERRIDE";
    String hitAction="BLOCK";
    KnowledgeRuleCandidate candidate;Deployment deployment;Long runId;
    @BeforeEach void setup() {context(T,7L,true);candidate=createCandidate();ready(candidate);approve(candidate);deployment=deploy(candidate);runId=observe(item(1),item(2));record("SUPPORTED");}
    void context(Long tenant,Long actor,boolean manage) {when(contexts.requireCurrent()).thenReturn(new ExecutionContext(tenant,actor,"reviewer-"+actor,"test",manage?Set.of("MASTER_DATA.MANAGE"):Set.of(),Long.valueOf(ORGANIZATION),Long.valueOf(DEPARTMENT),"DEPARTMENT",Set.of(),Set.of()));}
    KnowledgeRuleCandidate createCandidate() {var source=drafts.save(null,new com.rhn.quality.medication.api.MedicationKnowledgeDraftContracts.Save(0,duplicate(),"合成知识"));var p=rules.preview(source.saved().id(),1);return rules.create(source.saved().id(),new Create(1,p.programHash(),"合成候选"));}
    Case fixture(String title,String expected,List<String> ids,Row... rows) {return new Case(title,"人工先定义预期的合成测试，非临床依据",new FixtureInput(null,null,null,List.of(rows)),expected,ids);}
    SuiteDetail suite(KnowledgeRuleCandidate c,int expectedVersion,boolean complete) {var a=row("A","E1","S1","PO");var b=row("B","E1","S1","PO");var cases=new ArrayList<Case>();cases.add(fixture("正例","MATCH",List.of("A","B"),a,b));if(complete){cases.add(fixture("反例","NO_MATCH",List.of(),a));cases.add(fixture("缺失","UNAVAILABLE",List.of(),new Row("X",null,null,null,null,null,null,"ACTIVE")));}return tests.save(c.id(),new Save(expectedVersion,c.programHash(),"独立预期",cases));}
    void ready(KnowledgeRuleCandidate c) {var s=suite(c,0,true);tests.execute(c.id(),new Execute(1,s.suiteHash(),"执行合成样例"));}
    Command command(Preview p,String op) {return new Command(p.revision(),op,"SUBMIT".equals(op)?p.current().fingerprint():p.submission().basis().fingerprint(),"合成审核操作",hitAction,unavailableAction,true,true,true,"仅验证审核留痕，不构成临床批准材料");}
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

    com.rhn.quality.medication.api.MedicationKnowledgePublicationContracts.Preview publicationPreview(String operation,Deployment source) {return publication.preview(Long.valueOf(source.versionId()),source.id(),operation);}
    com.rhn.quality.medication.api.MedicationKnowledgePublicationContracts.Command publicationCommand(com.rhn.quality.medication.api.MedicationKnowledgePublicationContracts.Preview p) {
        return new com.rhn.quality.medication.api.MedicationKnowledgePublicationContracts.Command(p.revision(),p.basis().operation(),p.basis().sourceDeploymentId(),p.basis().throughRunId(),p.basis().fingerprint(),null,"合成样例完成核查，不作真实上线依据","如有异常暂停该科室正式发布，再按历史材料选择可用版本","隔离测试显式上线",true,true,true);
    }
    Deployment publish() {return publication.command(candidate.id(),publicationCommand(publicationPreview("PROMOTE",deployment)));}
    void pauseFormal(Deployment d) {deployments.command(Long.valueOf(d.versionId()),new com.rhn.quality.medication.api.MedicationKnowledgeDeploymentContracts.Command(deployments.preview(Long.valueOf(d.versionId())).revision(),"PAUSE","ENFORCED",null,d.id(),null,"暂停正式合成发布"));}
    @Test void explicit_activation_replaces_shadow_and_is_scoped_durable_and_independently_pausable() throws Exception {
        assertThat(json.write(deployment.knowledgeRelease())).doesNotContain("authorizationId");
        var p=publicationPreview("PROMOTE",deployment);assertThat(p.gaps()).isEmpty();assertThat(p.basis().observations()).hasSize(1);
        var formal=publish();var auth=publication.material(candidate.id(),formal.id());
        assertThat(auth.basis()).isEqualTo(p.basis());assertThat(formal.knowledgeRelease().authorizationId()).isEqualTo(auth.id());
        var input=snapshot(D,item(1),item(2));var plan=runtime.plan(input,List.of(),Instant.now());assertThat(plan.shadow()).isEmpty();assertThat(plan.enforced()).hasSize(1);
        assertThat(safety.evaluate(new PrescriptionSafetyRequest(input)).mode()).isEqualTo("ENFORCED");
        assertThat(runtime.evaluate(input,plan.enforced(),Instant.now()).decision()).isEqualTo(MedicationSafetyDecision.Status.BLOCK);
        assertThat(runtime.plan(snapshot(999L,item(1),item(2)),List.of(),Instant.now()).enforced()).isEmpty();
        String path="/api/quality/medication-knowledge-rule-candidates/"+candidate.id()+"/deployments/"+formal.id()+"/formal-material";
        mockMvc.perform(get(path).with(rhnWorkContext())).andExpect(status().isOk()).andExpect(jsonPath("$.deploymentId").value(formal.id().toString()));
        pauseFormal(formal);assertThat(runtime.plan(input,List.of(),Instant.now()).enforced()).isEmpty();assertThat(runtime.plan(input,List.of(),Instant.now()).shadow()).isEmpty();
        assertThat(publication.material(candidate.id(),formal.id())).isEqualTo(auth);
    }
    @Test void cohort_cutoff_is_explicit_and_new_opinions_or_missing_reviews_cannot_be_ignored() {
        var p=publicationPreview("PROMOTE",deployment);Long first=runId;runId=observe(item(1));
        assertThat(publicationPreview("PROMOTE",deployment).gaps()).anyMatch(g->g.contains("最新研判"));
        assertThatThrownBy(()->publication.command(candidate.id(),publicationCommand(publicationPreview("PROMOTE",deployment)))).hasMessageContaining("最新研判");
        runId=first;record("UNCERTAIN");
        assertThatThrownBy(()->publication.command(candidate.id(),publicationCommand(p))).hasMessageContaining("已变化");
        record("SUPPORTED");var complete=recordForAll();
        observe(item(1)); // A later evaluation is outside the explicitly frozen reviewed cohort.
        var formal=publication.command(candidate.id(),publicationCommand(complete));
        assertThat(publication.material(candidate.id(),formal.id()).basis().observations()).hasSize(2);
        assertThat(deployments.observations(candidate.id(),deployment.id(),0).feedback().pending()).isEqualTo(1);
    }
    com.rhn.quality.medication.api.MedicationKnowledgePublicationContracts.Preview recordForAll() {
        for(var o:deployments.observations(candidate.id(),deployment.id(),0).records().content()) {runId=o.id();record("SUPPORTED");}
        return publicationPreview("PROMOTE",deployment);
    }
    @Test void approved_unavailable_policy_is_executed_but_technical_failures_still_block() {
        var formal=publish();var bad=new PrescriptionSafetySnapshot.MedicationItem(2L,1,100L,null,null,"ACTIVE","LEGACY",null,null,null,null,null,"UNMAPPED",null,null,null,null,null,"{}",null,null);
        var input=snapshot(D,item(1),bad);var result=runtime.evaluate(input,List.of(new MedicationRuleRuntime.Selected("KNOWLEDGE:"+candidate.knowledgeId(),formal)),Instant.now());
        assertThat(result.decision()).isEqualTo(MedicationSafetyDecision.Status.REQUIRE_OVERRIDE);assertThat(result.failureCodes()).isEmpty();assertThat(result.executions()).anyMatch(e->"UNAVAILABLE".equals(e.outcome()));
        for(String policy:List.of("WARN","BLOCK")) {
            unavailableAction=policy;context(T,7L,true);candidate=createCandidate();ready(candidate);approve(candidate);deployment=deploy(candidate);runId=observe(item(1),item(2));record("SUPPORTED");formal=publish();
            result=runtime.evaluate(input,List.of(new MedicationRuleRuntime.Selected("KNOWLEDGE:"+candidate.knowledgeId(),formal)),Instant.now());
            assertThat(result.decision().name()).isEqualTo(policy);assertThat(result.findings()).singleElement().satisfies(f->assertThat(f.message()).contains("无法评价"));
        }
        var unsupported=new PrescriptionSafetySnapshot("unsupported-schema",T,1000L,2,2000L,3000L,O,D,"DRAFT",input.medications(),input.patientContext(),input.evaluationTiming());
        assertThat(runtime.evaluate(unsupported,List.of(new MedicationRuleRuntime.Selected("KNOWLEDGE:"+candidate.knowledgeId(),formal)),Instant.now()).decision()).isEqualTo(MedicationSafetyDecision.Status.UNAVAILABLE);
        jdbc.update("update RHN_AUD_KNOW_RELEASE set HASH_RELEASE='invalid' where ID_KNOW_RELEASE=?",formal.knowledgeRelease().authorizationId());
        assertThat(runtime.evaluate(input,List.of(new MedicationRuleRuntime.Selected("KNOWLEDGE:"+candidate.knowledgeId(),formal)),Instant.now()).decision()).isEqualTo(MedicationSafetyDecision.Status.UNAVAILABLE);
    }
    @Test void rollback_rechecks_old_approval_and_restores_old_version_as_a_new_release_without_automatic_fallback() {
        var oldCandidate=candidate;var oldFormal=publish();context(T,7L,true);
        drafts.save(candidate.knowledgeId(),new com.rhn.quality.medication.api.MedicationKnowledgeDraftContracts.Save(1,duplicate(),"合成知识第二版"));
        candidate=rules.create(candidate.knowledgeId(),new Create(2,rules.preview(candidate.knowledgeId(),2).programHash(),"第二版合成候选"));ready(candidate);approve(candidate);deployment=deploy(candidate);runId=observe(item(1),item(2));record("SUPPORTED");var newer=publish();
        var p=publication.preview(oldCandidate.id(),oldFormal.id(),"ROLLBACK");assertThat(p.gaps()).isEmpty();
        var restored=publication.command(oldCandidate.id(),publicationCommand(p));assertThat(restored.id()).isNotEqualTo(oldFormal.id());assertThat(restored.versionId()).isEqualTo(oldCandidate.id().toString());
        var active=runtime.plan(snapshot(D,item(1),item(2)),List.of(),Instant.now()).enforced();assertThat(active).singleElement().satisfies(r->assertThat(r.deployment().id()).isEqualTo(restored.id()));
        assertThat(deployments.preview(candidate.id()).deployments()).filteredOn(d->d.id().equals(newer.id())).singleElement().satisfies(d->assertThat(d.status()).isEqualTo("SUPERSEDED"));
        pauseFormal(restored);assertThat(runtime.plan(snapshot(D,item(1),item(2)),List.of(),Instant.now()).enforced()).isEmpty();
        assertThat(drafts.detail(candidate.knowledgeId()).saved().version()).isEqualTo(2);
        var state=governance.read(T,"KNOWLEDGE:"+oldCandidate.knowledgeId());
        var reviews=new ArrayList<>(state.state().reviews());reviews.removeIf(r->r.versionId().equals(oldCandidate.id().toString()));
        governance.save(T,state.key(),state.revision(),new com.rhn.quality.medication.api.MedicationRuleCatalogContracts.Governance(reviews,state.state().deployments(),state.state().history()));
        assertThat(publication.preview(oldCandidate.id(),oldFormal.id(),"ROLLBACK").gaps()).anyMatch(g->g.contains("审核已变化"));
    }
    @Test void command_validation_scope_concurrency_and_rollback_are_atomic() throws Exception {
        var p=publicationPreview("PROMOTE",deployment);var input=publicationCommand(p);
        assertThatThrownBy(()->publication.command(candidate.id(),new com.rhn.quality.medication.api.MedicationKnowledgePublicationContracts.Command(p.revision(),"PROMOTE",deployment.id(),p.basis().throughRunId(),p.basis().fingerprint(),null,"评估","回退","原因",false,true,true))).hasMessageContaining("确认观察");
        context(T,null,true);assertThatThrownBy(()->publicationPreview("PROMOTE",deployment)).hasMessageContaining("操作者身份");context(999L,8L,true);assertThatThrownBy(()->publicationPreview("PROMOTE",deployment)).hasMessageContaining("当前租户");context(T,8L,true);
        new TransactionTemplate(transactions).executeWithoutResult(tx->{publish();tx.setRollbackOnly();});
        assertThat(jdbc.queryForObject("select count(*) from RHN_AUD_KNOW_RELEASE",Integer.class)).isZero();
        var gate=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(2)) {
            Callable<String> task=()->{gate.await();try{publication.command(candidate.id(),input);return "PUBLISHED";}catch(BusinessException e){return e.code();}};
            var a=pool.submit(task);var b=pool.submit(task);gate.countDown();assertThat(List.of(a.get(20,TimeUnit.SECONDS),b.get(20,TimeUnit.SECONDS))).containsExactlyInAnyOrder("PUBLISHED","QMED_PUBLICATION_STALE");
        }
        assertThat(jdbc.queryForObject("select count(*) from RHN_AUD_KNOW_RELEASE",Integer.class)).isEqualTo(1);
    }
    @Test void clinical_prescription_submission_is_blocked_only_after_formal_activation_and_recovers_after_pause() throws Exception {
        var c=candidate;var formal=publish();
        var clinical=clinicalDuplicateDraft();var rx=clinical.rx();
        String encounter=clinical.encounter(),prescription=rx.path("id").asString();
        mockMvc.perform(post("/api/encounters/{e}/prescriptions/{p}/submit",encounter,prescription).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("{\"expectedRevision\":"+rx.path("revision").asLong()+"}"))
                .andExpect(status().isConflict());
        assertThat(jdbc.queryForObject("select count(*) from RHN_AUD_MED_EVAL where ID_RX=? and SD_MODE='ENFORCED'",Integer.class,prescription)).isEqualTo(1);
        assertThat(safety.find(Long.valueOf(prescription),jdbc.queryForObject("select max(ID_EVAL) from RHN_AUD_MED_EVAL where ID_RX=? and SD_MODE='ENFORCED'",Long.class,prescription)).orElseThrow().decision()).isEqualTo(MedicationSafetyDecision.Status.BLOCK);
        pauseFormal(formal);
        mockMvc.perform(post("/api/encounters/{e}/prescriptions/{p}/submit",encounter,prescription).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("{\"expectedRevision\":"+rx.path("revision").asLong()+"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ACTIVE"));

    }

    record ClinicalDraft(String encounter,tools.jackson.databind.JsonNode rx) {}
    ClinicalDraft clinicalDuplicateDraft() throws Exception {
        var doctor=identities.findActiveAccount(T,"doctor").orElseThrow();
        when(contexts.requireCurrent()).thenReturn(new ExecutionContext(T,doctor.id(),"doctor","test",Set.of("MASTER_DATA.MANAGE","OUTPATIENT_REGISTRATION.ACCESS","OUTPATIENT_RECEPTION.ACCESS"),O,D,"DEPARTMENT",Set.of(),Set.of(),doctor.practitionerId()));
        String medication=linkStandardMedication("STD-04D8635B1192769EBA24309B","MED-2026-W185").path("id").asString();
        String resident=json(mockMvc.perform(post("/api/residents").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
            {"fullName":"合成旁路提交","identifiers":[{"system":"9","value":"%s","useType":"SECONDARY"}],"gender":"MALE","birthDate":"1988-06-18"}
            """.formatted(UUID.randomUUID()))).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).path("id").asString();
        String encounter=json(mockMvc.perform(post("/api/encounters").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
            {"residentId":"%s","organizationId":"%s","departmentId":"%s"}
            """.formatted(resident,ORGANIZATION,DEPARTMENT))).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).path("id").asString();
        mockMvc.perform(verifiedEncounterStart(encounter)).andExpect(status().isOk());recordInpatientNoKnownDrugAllergy(resident,encounter);
        var rx=json(mockMvc.perform(post("/api/encounters/{id}/prescriptions",encounter).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("{\"categoryCode\":\"WESTERN\"}")).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        String prescription=rx.path("id").asString();
        for(int i=0;i<2;i++) mockMvc.perform(post("/api/encounters/{id}/medication-requests",encounter).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
            {"prescriptionId":"%s","medicationId":"%s","quantity":1,"quantityUnit":"片","doseValue":5,"doseUnit":"mg","routeCode":"PO","frequencyCode":"QD","durationValue":7,"durationUnit":"DAY","allergyReviewConfirmed":true,"substitutionAllowed":false,"selfProvided":true,"pricingRequired":false}
            """.formatted(prescription,medication))).andExpect(status().isCreated());
        return new ClinicalDraft(encounter,rx);
    }

    @Test void clinical_prescription_requiring_override_accepts_only_a_nonblank_handling_reason() throws Exception {
        context(T,7L,true);hitAction="REQUIRE_OVERRIDE";
        candidate=createCandidate();ready(candidate);approve(candidate);deployment=deploy(candidate);
        runId=observe(item(1),item(2));record("SUPPORTED");publish();
        var clinical=clinicalDuplicateDraft();
        String encounter=clinical.encounter(),prescription=clinical.rx().path("id").asString();
        long revision=clinical.rx().path("revision").asLong();
        for(String reason:List.of("","   ")) {
            mockMvc.perform(post("/api/encounters/{e}/prescriptions/{p}/submit",encounter,prescription)
                .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content(json.write(Map.of("expectedRevision",revision,"reason",reason))))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("MEDICATION_SAFETY_OVERRIDE_REASON_REQUIRED"));
        }
        mockMvc.perform(post("/api/encounters/{e}/prescriptions/{p}/submit",encounter,prescription)
            .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
            .content(json.write(Map.of("expectedRevision",revision,"reason","已核对合成测试条件，记录继续开立理由"))))
            .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ACTIVE"))
            .andExpect(jsonPath("$.safetyEvaluation.mode").value("ENFORCED"))
            .andExpect(jsonPath("$.safetyEvaluation.decision").value("REQUIRE_OVERRIDE"));
    }

}
