package com.rhn;

import com.rhn.quality.medication.api.MedicationKnowledgeReviewContracts.*;
import com.rhn.quality.medication.api.MedicationKnowledgeRuleContracts.KnowledgeRuleCandidate;
import com.rhn.quality.medication.api.MedicationKnowledgeRuleContracts.Create;
import com.rhn.quality.medication.api.MedicationKnowledgeTestContracts.*;
import com.rhn.quality.medication.api.MedicationKnowledgeDraftContracts.Row;
import com.rhn.quality.medication.api.MedicationRuleCatalogContracts.CatalogCommand;
import com.rhn.quality.medication.application.*;
import com.rhn.shared.context.*;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.json.JsonCodec;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import java.util.*;
import java.time.*;
import com.rhn.outpatient.api.*;
import com.rhn.quality.medication.api.MedicationRuleCatalogContracts.Deployment;
import com.rhn.platform.masterdata.api.StandardMedicationReferenceDirectory;

import java.util.concurrent.*;
import static com.rhn.MedicationKnowledgeDraftModelTest.*;
import static org.mockito.Mockito.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ResetDatabaseBeforeEachTestMethod
class MedicationKnowledgeDeploymentTest extends RhnIntegrationTestSupport {
    @Autowired MedicationKnowledgeDeploymentService deployments;
    @Autowired MedicationRuleRuntime runtime;
    @Autowired MedicationStandardImpactService impact;
    @Autowired com.rhn.platform.identityaccess.api.IdentityAccessDirectory identities;
    @Autowired MedicationSafetyAdapter safety;
    @Autowired StandardMedicationReferenceDirectory standards;
    @Autowired com.rhn.quality.medication.infrastructure.MedicationRuleGovernanceStore governance;
    @Autowired MedicationKnowledgeReviewService reviews;
    @Autowired MedicationKnowledgeRuleService rules;
    @Autowired MedicationKnowledgeDraftService drafts;
    @Autowired MedicationKnowledgeTestService tests;
    @Autowired MedicationRuleCatalogService catalog;
    @Autowired JsonCodec json;
    @Autowired JdbcTemplate jdbc;
    @MockitoBean ExecutionContextProvider contexts;
    static final Long T=Long.valueOf(TENANT),O=Long.valueOf(ORGANIZATION),D=Long.valueOf(DEPARTMENT);
    @BeforeEach void context() {context(T,7L,true);}
    void context(Long tenant,Long actor,boolean manage) {when(contexts.requireCurrent()).thenReturn(new ExecutionContext(tenant,actor,"reviewer-"+actor,"test",manage?Set.of("MASTER_DATA.MANAGE"):Set.of(),Long.valueOf(ORGANIZATION),Long.valueOf(DEPARTMENT),"DEPARTMENT",Set.of(),Set.of()));}
    KnowledgeRuleCandidate candidate() {var source=drafts.save(null,new com.rhn.quality.medication.api.MedicationKnowledgeDraftContracts.Save(0,duplicate(),"合成知识"));var p=rules.preview(source.saved().id(),1);return rules.create(source.saved().id(),new Create(1,p.programHash(),"合成候选"));}
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
    @Test void explicit_shadow_uses_approved_frozen_program_and_records_complete_observations() {
        var c=candidate();ready(c);assertThatThrownBy(()->deploy(c)).hasMessageContaining("尚未审核通过");approve(c);
        assertThat(runtime.plan(snapshot(D,item(1),item(2)),List.of(),Instant.now()).shadow()).isEmpty();
        var d=deploy(c);assertThat(d.knowledgeRelease().approval().operation()).isEqualTo("APPROVE");
        var input=snapshot(D,item(1),item(2));var plan=runtime.plan(input,List.of(),Instant.now());assertThat(plan.shadow()).hasSize(1);assertThat(plan.enforced()).isEmpty();
        var result=runtime.evaluate(input,plan.shadow(),Instant.now());assertThat(result.findings()).hasSize(1);assertThat(result.failureCodes()).isEmpty();
        var obs=deployments.observations(c.id(),d.id(),0);assertThat(obs.counts().get("MATCH")).isEqualTo(1);assertThat(obs.records().content().getFirst().matchedOrderIds()).containsExactly("1","2");
        var record=catalog.runs("KNOWLEDGE:"+c.knowledgeId()).getFirst();assertThat(record.organizationId()).isEqualTo(O);assertThat(record.departmentId()).isEqualTo(D);
        assertThat(record.details()).contains("inputHash").doesNotContain("patientId","patientContext","encounterId");
        assertThat(jdbc.queryForObject("select count(*) from RHN_AUD_MED_RULE_VER where ID_RULE_VER=?",Integer.class,c.id())).isEqualTo(1);
        var decision=safety.evaluate(new PrescriptionSafetyRequest(input));assertThat(decision.mode()).isEqualTo("SHADOW");assertThat(decision.evaluationId()).isNotNull();assertThat(decision.findings()).anyMatch(f->f.ruleCode().equals("QMED.KNOWLEDGE."+c.knowledgeId()));
    }
    @Test void missing_and_unmatched_facts_are_separate_and_pagination_counts_all_runs() {
        var c=candidate();ready(c);approve(c);var d=deploy(c);
        var bad=new PrescriptionSafetySnapshot.MedicationItem(2L,1,100L,null,null,"ACTIVE","LEGACY",null,null,null,null,null,"UNMAPPED",null,null,null,null,null,"{}",null,null);
        for(int i=0;i<21;i++) {var input=snapshot(D,item(1));runtime.evaluate(input,runtime.plan(input,List.of(),Instant.now()).shadow(),Instant.now());}
        var input=snapshot(D,item(1),bad);var result=runtime.evaluate(input,runtime.plan(input,List.of(),Instant.now()).shadow(),Instant.now());assertThat(result.decision()).isEqualTo(MedicationSafetyDecision.Status.UNAVAILABLE);
        var obs=deployments.observations(c.id(),d.id(),1);assertThat(obs.counts()).containsEntry("NO_MATCH",21L).containsEntry("UNAVAILABLE",1L).containsEntry("MATCH",0L);assertThat(obs.records().totalElements()).isEqualTo(22);assertThat(obs.records().content()).hasSize(2);
        assertThat(deployments.observations(c.id(),d.id(),0).records().content().getFirst().reasons()).anyMatch(r->r.contains("语义快照"));
    }
    @Test void scoped_runtime_and_observation_reads_never_cross_department_and_pause_does_not_fall_back() {
        var c=candidate();ready(c);approve(c);var d=deploy(c);var input=snapshot(D,item(1),item(2));runtime.evaluate(input,runtime.plan(input,List.of(),Instant.now()).shadow(),Instant.now());
        assertThat(runtime.plan(snapshot(999L,item(1),item(2)),List.of(),Instant.now()).shadow()).isEmpty();
        when(contexts.requireCurrent()).thenReturn(new ExecutionContext(T,8L,"other","test",Set.of("MASTER_DATA.MANAGE"),O,999L,"DEPARTMENT",Set.of(),Set.of()));
        assertThat(deployments.preview(c.id()).deployments()).isEmpty();assertThat(catalog.runs("KNOWLEDGE:"+c.knowledgeId())).isEmpty();
        assertThatThrownBy(()->deployments.observations(c.id(),d.id(),0)).hasMessageContaining("当前机构科室");assertThatThrownBy(()->pause(c,d)).hasMessageContaining("当前机构科室");
        context(T,8L,true);var second=deploy(c);assertThat(deployments.preview(c.id()).deployments().getFirst().status()).isEqualTo("SUPERSEDED");pause(c,second);
        assertThat(runtime.plan(input,List.of(),Instant.now()).shadow()).isEmpty();assertThat(deployments.observations(c.id(),d.id(),0).records().totalElements()).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from RHN_AUD_MED_RULE_VER where ID_RULE_VER=?",Integer.class,c.id())).isEqualTo(1);
    }
    @Test void source_changes_block_new_deployment_but_do_not_rewrite_active_snapshot_or_prevent_pause() {
        var c=candidate();ready(c);approve(c);var d=deploy(c);
        drafts.save(c.knowledgeId(),new com.rhn.quality.medication.api.MedicationKnowledgeDraftContracts.Save(1,duplicate(),"来源修订"));
        assertThatThrownBy(()->deploy(c)).hasMessageContaining("来源知识已有变化");
        var input=snapshot(D,item(1),item(2));var active=runtime.plan(input,List.of(),Instant.now()).shadow();assertThat(active.getFirst().deployment().knowledgeRelease()).isEqualTo(d.knowledgeRelease());
        assertThat(runtime.evaluate(input,active,Instant.now()).findings()).hasSize(1);pause(c,d);assertThat(runtime.plan(input,List.of(),Instant.now()).shadow()).isEmpty();
    }
    @Test void stale_hash_revision_expiry_formal_mode_and_permissions_are_rejected() throws Exception {
        var c=candidate();ready(c);approve(c);var p=deployments.preview(c.id());
        assertThatThrownBy(()->deployments.command(c.id(),new com.rhn.quality.medication.api.MedicationKnowledgeDeploymentContracts.Command(p.revision(),"DEPLOY","ENFORCED",p.approval().basis().fingerprint(),null,null,"错误模式"))).hasMessageContaining("独立发布入口");
        assertThatThrownBy(()->deployments.command(c.id(),new com.rhn.quality.medication.api.MedicationKnowledgeDeploymentContracts.Command(p.revision(),"DEPLOY","SHADOW","wrong",null,null,"错误指纹"))).hasMessageContaining("指纹不一致");
        assertThatThrownBy(()->deployments.command(c.id(),new com.rhn.quality.medication.api.MedicationKnowledgeDeploymentContracts.Command(p.revision(),"DEPLOY","SHADOW",p.approval().basis().fingerprint(),null,Instant.now().minusSeconds(1),"错误期限"))).hasMessageContaining("结束时间");
        var d=deployments.command(c.id(),new com.rhn.quality.medication.api.MedicationKnowledgeDeploymentContracts.Command(p.revision(),"DEPLOY","SHADOW",p.approval().basis().fingerprint(),null,Instant.now().plusSeconds(600),"有期限"));
        assertThat(runtime.plan(snapshot(D,item(1)),List.of(),d.effectiveTo()).shadow()).isEmpty();
        assertThatThrownBy(()->deployments.command(c.id(),new com.rhn.quality.medication.api.MedicationKnowledgeDeploymentContracts.Command(p.revision(),"DEPLOY","SHADOW",p.approval().basis().fingerprint(),null,null,"过期请求"))).hasMessageContaining("目录已变化");
        String path="/api/quality/medication-knowledge-rule-candidates/"+c.id()+"/deployments";
        mockMvc.perform(get(path).with(rhnWorkContext())).andExpect(status().isOk()).andExpect(jsonPath("$.departmentId").value(DEPARTMENT));
        mockMvc.perform(get(path+"/"+d.id()+"/observations").with(rhnWorkContext())).andExpect(status().isOk()).andExpect(jsonPath("$.records.totalElements").value(0));
        mockMvc.perform(get(path).header("X-Tenant-Id",TENANT)).andExpect(status().isUnauthorized());
        context(999L,8L,true);assertThatThrownBy(()->deployments.preview(c.id())).hasMessageContaining("当前租户");context(T,8L,false);assertThatThrownBy(()->deployments.preview(c.id())).hasMessageContaining("权限");
    }
    @Test void altered_release_fingerprint_returns_unavailable_instead_of_running_the_program() {
        var c=candidate();ready(c);approve(c);var d=deploy(c);var release=d.knowledgeRelease();
        var bad=new Deployment(d.id(),d.versionId(),d.version(),d.mode(),d.status(),d.action(),d.organizationId(),d.departmentId(),d.effectiveFrom(),d.effectiveTo(),d.actorId(),d.createdAt(),d.reason(),d.candidate(),d.executable(),new com.rhn.quality.medication.api.MedicationKnowledgeDeploymentContracts.Release(release.approval(),release.factAdapterVersion(),"wrong"));
        var result=runtime.evaluate(snapshot(D,item(1),item(2)),List.of(new MedicationRuleRuntime.Selected("KNOWLEDGE:"+c.knowledgeId(),bad)),Instant.now());assertThat(result.decision()).isEqualTo(MedicationSafetyDecision.Status.UNAVAILABLE);assertThat(result.findings()).isEmpty();
        assertThat(deployments.observations(c.id(),d.id(),0).counts().get("UNAVAILABLE")).isEqualTo(1);
    }
    @Test void interactions_match_frozen_group_pairs_and_reject_mixed_editions() {
        var a=standards.requireSpecification("STD-04D8635B1192769EBA24309B");var b=standards.requireSpecification("STD-9405B86DD5B404C44E1B92B5");
        var base=duplicate();var body=new com.rhn.quality.medication.api.MedicationKnowledgeDraftContracts.Body("合成配对规则","DRUG_INTERACTION","GROUP_PAIR",List.of(new com.rhn.quality.medication.api.MedicationKnowledgeDraftContracts.Target("ENTRY",a.specificationId(),a.catalogId(),a.catalogVersion(),a.contentHash())),List.of(new com.rhn.quality.medication.api.MedicationKnowledgeDraftContracts.Target("SPECIFICATION",b.specificationId(),b.catalogId(),b.catalogVersion(),b.contentHash())),null,"SAME_PRESCRIPTION",base.conditions(),base.evidence(),"仅验证组间配对，不构成临床知识","HIGH","WARN");
        var k=drafts.save(null,new com.rhn.quality.medication.api.MedicationKnowledgeDraftContracts.Save(0,body,"合成配对"));var c=rules.create(k.saved().id(),new Create(1,rules.preview(k.saved().id(),1).programHash(),"合成候选"));
        var x=new Row("A",a.catalogId(),a.catalogVersion(),a.contentHash(),a.entryId(),a.specificationId(),null,"ACTIVE");var y=new Row("B",b.catalogId(),b.catalogVersion(),b.contentHash(),b.entryId(),b.specificationId(),null,"ACTIVE");
        var suite=tests.save(c.id(),new Save(0,c.programHash(),"合成人工预期",List.of(fixture("配对","MATCH",List.of("A","B"),x,y),fixture("缺乙","NO_MATCH",List.of(),x),fixture("无身份","UNAVAILABLE",List.of(),new Row("X",null,null,null,null,null,null,"ACTIVE")))));tests.execute(c.id(),new Execute(1,suite.suiteHash(),"执行"));approve(c);var d=deploy(c);
        var report=impact.inspect(new com.rhn.platform.masterdata.api.MedicationStandardDependencyDirectory.Scope(a.catalogId(),a.entryId(),a.specificationId()),"DEPLOYMENT",true,0,100);
        assertThat(report.content()).filteredOn(v->v.id().equals(d.id().toString())).singleElement().satisfies(v->assertThat(v.traces()).anyMatch(t->a.contentHash().equals(t.contentHash())));
        var input=snapshot(D,item(1,a.catalogId(),a.catalogVersion(),a.contentHash(),a.entryId(),"OTHER-SPEC","ACTIVE"),item(2,b.catalogId(),b.catalogVersion(),b.contentHash(),b.entryId(),b.specificationId(),"ACTIVE"));
        assertThat(runtime.evaluate(input,runtime.plan(input,List.of(),Instant.now()).shadow(),Instant.now()).findings()).hasSize(1);
        var mixed=snapshot(D,input.medications().getFirst(),item(2,b.catalogId(),"old",b.contentHash(),b.entryId(),b.specificationId(),"ACTIVE"));
        assertThat(runtime.evaluate(mixed,runtime.plan(mixed,List.of(),Instant.now()).shadow(),Instant.now()).decision()).isEqualTo(MedicationSafetyDecision.Status.UNAVAILABLE);
        assertThat(deployments.observations(c.id(),d.id(),0).counts()).containsEntry("MATCH",1L).containsEntry("UNAVAILABLE",1L);
    }
    @Test void clinical_prescription_submission_records_shadow_block_without_blocking_submission() throws Exception {
        var c=candidate();ready(c);reviews.command(c.id(),command(reviews.preview(c.id()),"SUBMIT"));context(T,8L,true);
        var p=reviews.preview(c.id());reviews.command(c.id(),new Command(p.revision(),"APPROVE",p.submission().basis().fingerprint(),"合成拦截策略测试","BLOCK","BLOCK",true,true,true,"仅验证旁路不执行拦截"));var d=deploy(c);
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
        mockMvc.perform(post("/api/encounters/{e}/prescriptions/{p}/submit",encounter,prescription).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("{\"expectedRevision\":"+rx.path("revision").asLong()+"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ACTIVE")).andExpect(jsonPath("$.safetyEvaluation.mode").value("SHADOW"))
                .andExpect(jsonPath("$.safetyEvaluation.decision").value("BLOCK"));
        assertThat(deployments.observations(c.id(),d.id(),0).counts()).containsEntry("MATCH",1L);
        assertThat(jdbc.queryForObject("select count(*) from RHN_AUD_MED_EVAL where ID_RX=? and SD_MODE='ENFORCED'",Integer.class,prescription)).isZero();
    }

    @Test void concurrent_deployments_cannot_overwrite_the_same_governance_revision() throws Exception {
        var c=candidate();ready(c);approve(c);var p=deployments.preview(c.id());var input=new com.rhn.quality.medication.api.MedicationKnowledgeDeploymentContracts.Command(p.revision(),"DEPLOY","SHADOW",p.approval().basis().fingerprint(),null,null,"并发发布测试");var gate=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(2)) {
            Callable<String> task=()->{gate.await();try{deployments.command(c.id(),input);return "DEPLOYED";}catch(BusinessException e){return e.code();}};
            var a=pool.submit(task);var b=pool.submit(task);gate.countDown();
            assertThat(List.of(a.get(20,TimeUnit.SECONDS),b.get(20,TimeUnit.SECONDS))).containsExactlyInAnyOrder("DEPLOYED","QMED_KNOW_DEPLOY_STALE");
        }
        assertThat(deployments.preview(c.id()).deployments()).hasSize(1);
    }

}
