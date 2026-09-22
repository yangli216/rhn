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
import java.util.concurrent.*;
import static com.rhn.MedicationKnowledgeDraftModelTest.*;
import static org.mockito.Mockito.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ResetDatabaseBeforeEachTestMethod
class MedicationKnowledgeReviewTest extends RhnIntegrationTestSupport {
    @Autowired MedicationKnowledgeReviewService reviews;
    @Autowired MedicationKnowledgeRuleService rules;
    @Autowired MedicationKnowledgeDraftService drafts;
    @Autowired MedicationKnowledgeTestService tests;
    @Autowired MedicationRuleCatalogService catalog;
    @Autowired JsonCodec json;
    @Autowired JdbcTemplate jdbc;
    @MockitoBean ExecutionContextProvider contexts;
    static final Long T=Long.valueOf(TENANT);
    @BeforeEach void context() {context(T,7L,true);}
    void context(Long tenant,Long actor,boolean manage) {when(contexts.requireCurrent()).thenReturn(new ExecutionContext(tenant,actor,"reviewer-"+actor,"test",manage?Set.of("MASTER_DATA.MANAGE"):Set.of(),Long.valueOf(ORGANIZATION),Long.valueOf(DEPARTMENT),"DEPARTMENT",Set.of(),Set.of()));}
    KnowledgeRuleCandidate candidate() {var source=drafts.save(null,new com.rhn.quality.medication.api.MedicationKnowledgeDraftContracts.Save(0,duplicate(),"合成知识"));var p=rules.preview(source.saved().id(),1);return rules.create(source.saved().id(),new Create(1,p.programHash(),"合成候选"));}
    Case fixture(String title,String expected,List<String> ids,Row... rows) {return new Case(title,"人工先定义预期的合成测试，非临床依据",new FixtureInput(null,null,null,List.of(rows)),expected,ids);}
    SuiteDetail suite(KnowledgeRuleCandidate c,int expectedVersion,boolean complete) {var a=row("A","E1","S1","PO");var b=row("B","E1","S1","PO");var cases=new ArrayList<Case>();cases.add(fixture("正例","MATCH",List.of("A","B"),a,b));if(complete){cases.add(fixture("反例","NO_MATCH",List.of(),a));cases.add(fixture("缺失","UNAVAILABLE",List.of(),new Row("X",null,null,null,null,null,null,"ACTIVE")));}return tests.save(c.id(),new Save(expectedVersion,c.programHash(),"独立预期",cases));}
    void ready(KnowledgeRuleCandidate c) {var s=suite(c,0,true);tests.execute(c.id(),new Execute(1,s.suiteHash(),"执行合成样例"));}
    Command command(Preview p,String op) {return new Command(p.revision(),op,"SUBMIT".equals(op)?p.current().fingerprint():p.submission().basis().fingerprint(),"合成审核操作","WARN","REQUIRE_OVERRIDE",true,true,true,"仅验证审核留痕，不构成临床批准材料");}
    @Test void preflight_requires_latest_manual_validation_and_major_outcome_kinds() {
        var c=candidate();var empty=reviews.preview(c.id());assertThat(empty.gaps()).contains("尚未编写人工验证样例");assertThat(empty.allowedOperations()).isEmpty();
        var s=suite(c,0,false);tests.execute(c.id(),new Execute(1,s.suiteHash(),"只验证一个正例"));
        assertThat(reviews.preview(c.id()).gaps()).anyMatch(g->g.contains("主要预期结果"));
        var complete=suite(c,1,true);assertThat(reviews.preview(c.id()).gaps()).contains("最新人工样例尚未运行");
        tests.execute(c.id(),new Execute(2,complete.suiteHash(),"完整主要结果类型"));
        var p=reviews.preview(c.id());assertThat(p.gaps()).isEmpty();assertThat(p.allowedOperations()).containsExactly("SUBMIT");
        assertThat(reviews.history(c.id(),0).totalElements()).isZero();
    }
    @Test void author_cannot_self_approve_and_approval_pins_evidence_actions_and_tests_without_deployment() {
        var c=candidate();ready(c);var submitted=reviews.command(c.id(),command(reviews.preview(c.id()),"SUBMIT"));
        var author=reviews.preview(c.id());assertThat(author.status()).isEqualTo("IN_REVIEW");assertThat(author.allowedOperations()).containsExactly("WITHDRAW");
        assertThatThrownBy(()->reviews.command(c.id(),command(author,"APPROVE"))).hasMessageContaining("职责分离");
        context(T,8L,true);var peer=reviews.preview(c.id());assertThat(peer.allowedOperations()).containsExactly("REJECT","APPROVE");
        var accepted=reviews.command(c.id(),command(peer,"APPROVE"));assertThat(accepted.basis()).isEqualTo(submitted.basis());assertThat(accepted.submissionId()).isEqualTo(submitted.id());
        assertThat(accepted.action()).isEqualTo("WARN");assertThat(accepted.unavailableAction()).isEqualTo("REQUIRE_OVERRIDE");
        assertThat(reviews.event(c.id(),submitted.id())).isEqualTo(submitted);assertThat(reviews.event(c.id(),accepted.id())).isEqualTo(accepted);
        var entry=catalog.catalog().rules().stream().filter(e->e.key().equals("KNOWLEDGE:"+c.knowledgeId())).findFirst().orElseThrow();
        var v=entry.versions().getFirst();assertThat(v.reviewStatus()).isEqualTo("APPROVED");assertThat(v.review().knowledgeReviewId()).isEqualTo(accepted.id());
        assertThat(v.review().evidence().getFirst().usageScope()).isEqualTo("INSTITUTION_POLICY");assertThat(entry.deployments()).isEmpty();
        assertThat(jdbc.queryForObject("select count(*) from RHN_AUD_MED_RULE_VER where ID_RULE_VER=?",Integer.class,c.id())).isZero();
        assertThatThrownBy(()->catalog.command(entry.key(),new CatalogCommand(entry.revision(),"DEPLOY",c.id().toString(),null,"不可发布","WARN",List.of(),true,true,"SHADOW",Long.valueOf(ORGANIZATION),Long.valueOf(DEPARTMENT),null,null))).hasMessageContaining("独立发布入口");
    }
    @Test void submission_material_changes_require_withdrawal_and_resubmission_and_history_stays_frozen() {
        var c=candidate();ready(c);var first=reviews.command(c.id(),command(reviews.preview(c.id()),"SUBMIT"));
        var next=suite(c,1,true);tests.execute(c.id(),new Execute(2,next.suiteHash(),"修订后的验证"));
        context(T,8L,true);var peer=reviews.preview(c.id());assertThat(peer.basisUnchanged()).isFalse();assertThat(peer.allowedOperations()).containsExactly("REJECT");
        assertThat(peer.submission().basis().validation().suite().version()).isEqualTo(1);assertThat(peer.current().validation().suite().version()).isEqualTo(2);
        assertThatThrownBy(()->reviews.command(c.id(),command(peer,"APPROVE"))).hasMessageContaining("不能执行");
        context(T,7L,true);reviews.command(c.id(),command(reviews.preview(c.id()),"WITHDRAW"));
        var second=reviews.command(c.id(),command(reviews.preview(c.id()),"SUBMIT"));
        assertThat(second.basis().validation().suite().version()).isEqualTo(2);assertThat(reviews.event(c.id(),first.id())).isEqualTo(first);
        assertThat(reviews.history(c.id(),0).content()).extracting(Summary::operation).containsExactly("SUBMIT","WITHDRAW","SUBMIT");
    }
    @Test void newer_knowledge_and_stale_request_hashes_cannot_be_approved() {
        var c=candidate();ready(c);var before=reviews.preview(c.id());
        assertThatThrownBy(()->reviews.command(c.id(),new Command(before.revision(),"SUBMIT","f".repeat(64),"错误指纹",null,null,null,null,null,null))).hasMessageContaining("材料已变化");
        reviews.command(c.id(),command(before,"SUBMIT"));
        drafts.save(c.knowledgeId(),new com.rhn.quality.medication.api.MedicationKnowledgeDraftContracts.Save(1,duplicate(),"来源新版本"));
        context(T,8L,true);var peer=reviews.preview(c.id());assertThat(peer.gaps()).anyMatch(g->g.contains("来源知识已有变化"));
        assertThat(peer.allowedOperations()).containsExactly("REJECT");reviews.command(c.id(),command(peer,"REJECT"));
        assertThat(reviews.preview(c.id()).status()).isEqualTo("REJECTED");assertThat(reviews.preview(c.id()).allowedOperations()).isEmpty();
    }
    @Test void sample_author_and_executor_and_submitter_are_all_excluded_from_review() {
        var c=candidate();context(T,8L,true);var s=suite(c,0,true);context(T,9L,true);tests.execute(c.id(),new Execute(1,s.suiteHash(),"执行者独立记录"));
        context(T,10L,true);reviews.command(c.id(),command(reviews.preview(c.id()),"SUBMIT"));
        for(Long actor:List.of(7L,8L,9L,10L)) {context(T,actor,true);assertThat(reviews.preview(c.id()).allowedOperations()).doesNotContain("APPROVE","REJECT");}
        context(T,11L,true);var p=reviews.preview(c.id());assertThat(p.allowedOperations()).contains("APPROVE");
        for(var invalid:List.of(new Command(p.revision(),"APPROVE",p.submission().basis().fingerprint(),"缺少验证确认","WARN","BLOCK",true,true,false,"意见"),new Command(p.revision(),"APPROVE",p.submission().basis().fingerprint(),"缺少缺失策略","WARN",null,true,true,true,"意见"),new Command(p.revision(),"APPROVE",p.submission().basis().fingerprint(),"缺少审核意见","WARN","BLOCK",true,true,true,"")))
            assertThatThrownBy(()->reviews.command(c.id(),invalid)).hasMessageContaining("须核对标准");
    }
    @Test void concurrent_review_decisions_append_only_one_event_and_state_revision() throws Exception {
        var c=candidate();ready(c);reviews.command(c.id(),command(reviews.preview(c.id()),"SUBMIT"));context(T,8L,true);var input=command(reviews.preview(c.id()),"APPROVE");var gate=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(2)) {
            Callable<String> task=()->{gate.await();try{reviews.command(c.id(),input);return "APPROVED";}catch(BusinessException e){return e.code();}};
            var a=pool.submit(task);var b=pool.submit(task);gate.countDown();
            assertThat(List.of(a.get(20,TimeUnit.SECONDS),b.get(20,TimeUnit.SECONDS))).containsExactlyInAnyOrder("APPROVED","QMED_KNOW_REVIEW_STALE");
        }
        assertThat(reviews.history(c.id(),0).totalElements()).isEqualTo(2);
    }
    @Test void tenant_permissions_candidate_identity_and_http_contracts_apply() throws Exception {
        var c=candidate();ready(c);String path="/api/quality/medication-knowledge-rule-candidates/"+c.id()+"/review";
        mockMvc.perform(get(path).with(rhnWorkContext())).andExpect(status().isOk()).andExpect(jsonPath("$.allowedOperations[0]").value("SUBMIT"));
        mockMvc.perform(post(path+"/commands").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(json.write(command(reviews.preview(c.id()),"SUBMIT")))).andExpect(status().isOk()).andExpect(jsonPath("$.operation").value("SUBMIT"));
        var submitted=reviews.preview(c.id()).submission();var other=candidate();assertThatThrownBy(()->reviews.event(other.id(),submitted.id())).hasMessageContaining("该候选");
        assertThatThrownBy(()->reviews.history(c.id(),-1)).hasMessageContaining("分页参数");
        mockMvc.perform(get(path).header("X-Tenant-Id",TENANT)).andExpect(status().isUnauthorized());
        context(9999L,8L,true);assertThatThrownBy(()->reviews.preview(c.id())).hasMessageContaining("当前租户");assertThatThrownBy(()->reviews.event(c.id(),submitted.id())).hasMessageContaining("当前租户");
        context(T,8L,false);assertThatThrownBy(()->reviews.history(c.id(),0)).hasMessageContaining("权限");
        context(T,null,true);assertThatThrownBy(()->reviews.preview(c.id())).hasMessageContaining("操作者身份");
    }
    @Test void overlapping_knowledge_is_pinned_for_comparison_and_new_overlap_invalidates_pending_material() {
        var c=candidate();ready(c);var first=reviews.command(c.id(),command(reviews.preview(c.id()),"SUBMIT"));
        var other=candidate();context(T,8L,true);var p=reviews.preview(c.id());
        assertThat(p.current().possibleConflicts()).singleElement().satisfies(v->assertThat(v.id()).isEqualTo(other.knowledgeId()));
        assertThat(p.submission().basis().possibleConflicts()).isEmpty();assertThat(p.basisUnchanged()).isFalse();assertThat(p.allowedOperations()).containsExactly("REJECT");
        assertThat(reviews.event(c.id(),first.id())).isEqualTo(first);
        String corrupt=json.write(first).replace("合成测试材料，非临床依据","篡改提交时原文标题");
        jdbc.update("update RHN_AUD_KNOW_REVIEW set JSON_REVIEW=? where ID_TNT=? and ID_KNOW_REVIEW=?",corrupt,T,first.id());
        assertThatThrownBy(()->reviews.event(c.id(),first.id())).hasMessageContaining("审核材料身份或指纹不一致");
    }
}
