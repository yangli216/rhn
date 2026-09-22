package com.rhn;

import com.rhn.quality.medication.api.MedicationKnowledgeDraftContracts.*;
import com.rhn.quality.medication.api.MedicationKnowledgeRuleContracts.*;
import com.rhn.quality.medication.api.MedicationKnowledgeTestContracts.*;
import com.rhn.quality.medication.application.*;
import com.rhn.shared.context.*;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.json.JsonCodec;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import java.time.LocalDate;
import java.util.*;
import java.util.concurrent.*;
import static com.rhn.MedicationKnowledgeDraftModelTest.*;
import static org.mockito.Mockito.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static com.rhn.quality.medication.application.MedicationKnowledgeReplayService.hash;

@ResetDatabaseBeforeEachTestMethod
class MedicationKnowledgeTestTest extends RhnIntegrationTestSupport {
    @Autowired MedicationKnowledgeTestService tests;
    @Autowired MedicationKnowledgeDraftService drafts;
    @Autowired MedicationKnowledgeRuleService candidates;
    @Autowired MedicationRuleCatalogService catalog;
    @Autowired JdbcTemplate jdbc;
    @Autowired JsonCodec json;
    @MockitoBean ExecutionContextProvider contexts;
    static final Long T=Long.valueOf(TENANT);
    @BeforeEach void context() {context(T,true);}
    void context(Long tenant,boolean manage) {when(contexts.requireCurrent()).thenReturn(new ExecutionContext(tenant,7L,"fixture-author","test",manage?Set.of("MASTER_DATA.MANAGE"):Set.of(),Long.valueOf(ORGANIZATION),Long.valueOf(DEPARTMENT),"DEPARTMENT",Set.of(),Set.of()));}
    KnowledgeRuleCandidate candidate() {var s=drafts.save(null,new com.rhn.quality.medication.api.MedicationKnowledgeDraftContracts.Save(0,duplicate(),"合成测试"));var p=candidates.preview(s.saved().id(),1);return candidates.create(s.saved().id(),new Create(1,p.programHash(),"合成候选"));}
    Case fixture(String name,String expected,List<String> ids,Row... rows) {return new Case(name,"人工先定义预期；合成事实，非临床证据",new FixtureInput(java.math.BigDecimal.valueOf(30),"YEAR",LocalDate.of(2026,1,1),List.of(rows)),expected,ids);}
    SuiteDetail save(KnowledgeRuleCandidate c,int version,Case... rows) {return tests.save(c.id(),new com.rhn.quality.medication.api.MedicationKnowledgeTestContracts.Save(version,c.programHash(),"保存人工样例",List.of(rows)));}
    Run execute(KnowledgeRuleCandidate c,SuiteDetail s) {return tests.execute(c.id(),new Execute(s.suite().version(),s.suiteHash(),"运行固定样例"));}
    @Test void manual_expected_outcome_and_exact_order_set_are_compared_and_failures_persist() {
        var c=candidate();var a=row("A","E1","S1","PO");var b=row("B","E1","S1","PO");
        var before=catalog.catalog();
        var s=save(c,0,fixture("正例","MATCH",List.of("B","A"),a,b),fixture("预期医嘱不完整","MATCH",List.of("A"),a,b),fixture("结果预期不符","NO_MATCH",List.of(),a,b));
        assertThat(tests.runs(c.id(),0).content()).isEmpty(); // Saving does not infer or run the expected values.
        var result=execute(c,s);
        assertThat(result.allPassed()).isFalse();assertThat(result.results()).extracting(CaseResult::passed).containsExactly(true,false,false);
        assertThat(result.results().get(1).actual().matchedOrderIds()).containsExactly("A","B");
        assertThat(result.suite()).isEqualTo(s.suite());assertThat(result.missingOutcomeKinds()).containsExactly("UNAVAILABLE");
        assertThat(tests.run(c.id(),result.id())).isEqualTo(result);
        assertThat(tests.runs(c.id(),0).content()).singleElement().satisfies(r->assertThat(r.passedCount()).isEqualTo(1));
        var after=catalog.catalog().rules().stream().filter(e->e.key().equals("KNOWLEDGE:"+c.knowledgeId())).findFirst().orElseThrow();
        var original=before.rules().stream().filter(e->e.key().equals(after.key())).findFirst().orElseThrow();
        assertThat(after.history()).isEqualTo(original.history());assertThat(after.deployments()).isEqualTo(original.deployments());
        assertThat(after.versions().getFirst().reviewStatus()).isEqualTo("DRAFT");
        assertThat(after.versions().getFirst().manualValidation().status()).isEqualTo("FAILED");
    }
    @Test void version_edits_preserve_old_cases_and_runs_and_old_suite_can_be_explicitly_rerun() {
        var c=candidate();var a=row("A","E1","S1","PO");var b=row("B","E1","S1","PO");
        var first=save(c,0,fixture("人工反例","NO_MATCH",List.of(),a,b));var failed=execute(c,first);
        var next=save(c,1,fixture("核对后修改预期","MATCH",List.of("A","B"),a,b));
        var status=catalog.catalog().rules().stream().filter(e->e.key().equals("KNOWLEDGE:"+c.knowledgeId())).findFirst().orElseThrow().versions().getFirst().manualValidation();
        assertThat(status.status()).isEqualTo("NOT_RUN");assertThat(status.suiteVersion()).isEqualTo(2);assertThat(status.caseCount()).isEqualTo(1);
        var passed=execute(c,next);
        assertThat(passed.allPassed()).isTrue();assertThat(passed.missingOutcomeKinds()).containsExactly("NO_MATCH","UNAVAILABLE");
        assertThat(tests.suite(c.id(),1)).isEqualTo(first);assertThat(tests.run(c.id(),failed.id())).isEqualTo(failed);
        assertThat(execute(c,first).allPassed()).isFalse();
        var current=catalog.catalog().rules().stream().filter(e->e.key().equals("KNOWLEDGE:"+c.knowledgeId())).findFirst().orElseThrow().versions().getFirst().manualValidation();
        assertThat(current.status()).isEqualTo("PASSED");assertThat(current.suiteVersion()).isEqualTo(2);
        assertThat(tests.suites(c.id(),0).content()).extracting(SuiteSummary::version).containsExactly(2,1);
        assertThatThrownBy(()->save(c,1,first.suite().cases().getFirst())).hasMessageContaining("样例已被修改");
    }
    @Test void missing_and_conflicting_facts_are_testable_and_outcome_coverage_does_not_claim_approval() {
        var c=candidate();var a=row("A","E1","S1","PO");
        var s=save(c,0,fixture("缺失标准","UNAVAILABLE",List.of(),new Row("X",null,null,null,null,null,null,"ACTIVE")),
                fixture("冲突医嘱","UNAVAILABLE",List.of(),a,row("A","E2","S2","PO")),
                fixture("不同目录版次","UNAVAILABLE",List.of(),a,new Row("B","C","OLD","hash","E1","S1","PO","ACTIVE")),
                fixture("取消不参与","NO_MATCH",List.of(),a,new Row("B",null,null,null,null,null,null,"CANCELLED")),
                fixture("命中","MATCH",List.of("A","B"),a,row("B","E1","S1","PO")),
                new Case("同名不同标准条目","展示名称不参与判断",new FixtureInput(null,null,null,List.of(a,row("B","E2","S2","PO"))),"NO_MATCH",List.of(),Map.of("S1","同名合成药品","S2","同名合成药品")));
        var r=execute(c,s);assertThat(r.allPassed()).isTrue();assertThat(r.missingOutcomeKinds()).isEmpty();
        assertThat(catalog.catalog().rules()).filteredOn(e->e.key().equals("KNOWLEDGE:"+c.knowledgeId())).singleElement().satisfies(e->{assertThat(e.deployments()).isEmpty();assertThat(e.versions().getFirst().reviewStatus()).isEqualTo("DRAFT");});
    }
    @Test void bounds_and_expected_values_and_fingerprints_are_enforced() {
        var c=candidate();var f=fixture("反例","NO_MATCH",List.of(),row("A","E1","S1","PO"));
        assertThatThrownBy(()->save(c,0)).hasMessageContaining("1 至 30");
        assertThatThrownBy(()->save(c,0,f,f)).hasMessageContaining("不同名称");
        assertThatThrownBy(()->save(c,0,fixture("命中缺标识","MATCH",List.of()))).hasMessageContaining("命中样例须指定");
        assertThatThrownBy(()->save(c,0,fixture("不存在标识","MATCH",List.of("Z"),row("A","E1","S1","PO")))).hasMessageContaining("必须存在");
        assertThatThrownBy(()->save(c,0,new Case("无依据","",f.input(),"NO_MATCH",List.of()))).hasMessageContaining("预期依据");
        assertThatThrownBy(()->tests.save(c.id(),new com.rhn.quality.medication.api.MedicationKnowledgeTestContracts.Save(0,"f".repeat(64),"原因",List.of(f)))).hasMessageContaining("候选表达指纹");
        assertThatThrownBy(()->save(c,0,new Case("小数年龄","不应截断",new FixtureInput(new java.math.BigDecimal("1.5"),"YEAR",null,List.of()),"NO_MATCH",List.of()))).hasMessageContaining("不能截断小数");
        var s=save(c,0,f);
        assertThatThrownBy(()->tests.execute(c.id(),new Execute(1,"f".repeat(64),"原因"))).hasMessageContaining("指纹不一致");
        assertThatThrownBy(()->tests.execute(c.id(),new Execute(1,s.suiteHash(),""))).hasMessageContaining("操作原因");
        assertThat(tests.runs(c.id(),0).totalElements()).isZero();
    }
    @Test void concurrent_suite_edits_cannot_replace_each_other() throws Exception {
        var c=candidate();var f=fixture("合成反例","NO_MATCH",List.of());save(c,0,f);var gate=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(2)) {
            Callable<String> task=()->{gate.await();try {save(c,1,f);return "SAVED";}catch(BusinessException ex){return ex.code();}};
            var a=pool.submit(task);var b=pool.submit(task);gate.countDown();
            assertThat(List.of(a.get(20,TimeUnit.SECONDS),b.get(20,TimeUnit.SECONDS))).containsExactlyInAnyOrder("SAVED","QMED_KNOW_TEST_STALE");
        }
        assertThat(tests.suites(c.id(),0).totalElements()).isEqualTo(2);
    }
    @Test void tenant_candidate_permission_and_paging_boundaries_apply_to_history_and_execution() throws Exception {
        var c=candidate();var s=save(c,0,fixture("空处方","NO_MATCH",List.of()));var r=execute(c,s);var other=candidate();
        assertThatThrownBy(()->tests.run(other.id(),r.id())).hasMessageContaining("该候选");
        assertThatThrownBy(()->tests.execute(other.id(),new Execute(1,s.suiteHash(),"跨候选"))).hasMessageContaining("该候选");
        for(int i=1;i<=20;i++) save(c,i,s.suite().cases().getFirst());
        assertThat(tests.suites(c.id(),1).content()).hasSize(1);
        assertThatThrownBy(()->tests.runs(c.id(),-1)).hasMessageContaining("分页参数");
        String path="/api/quality/medication-knowledge-rule-candidates/"+c.id()+"/tests";
        mockMvc.perform(get(path+"/suites/1").with(rhnWorkContext())).andExpect(status().isOk()).andExpect(jsonPath("$.suite.version").value(1));
        mockMvc.perform(post(path+"/runs").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(json.write(new Execute(1,s.suiteHash(),"HTTP 合成验证")))).andExpect(status().isOk()).andExpect(jsonPath("$.allPassed").value(true));
        mockMvc.perform(get(path+"/runs").header("X-Tenant-Id",TENANT)).andExpect(status().isUnauthorized());
        context(9999L,true);assertThatThrownBy(()->tests.suites(c.id(),0)).hasMessageContaining("当前租户");assertThatThrownBy(()->tests.run(c.id(),r.id())).hasMessageContaining("当前租户");assertThatThrownBy(()->execute(c,s)).hasMessageContaining("当前租户");
        context(T,false);assertThatThrownBy(()->tests.suite(c.id(),1)).hasMessageContaining("权限");assertThatThrownBy(()->save(c,21,s.suite().cases().getFirst())).hasMessageContaining("权限");assertThatThrownBy(()->execute(c,s)).hasMessageContaining("权限");
    }
    @Test void unsupported_engine_is_not_a_passing_unavailable_case_and_corrupt_candidates_are_rejected() {
        var c=candidate();var p=c.program();
        var future=new Program("future",p.operator(),p.exposureScope(),p.groupA(),p.groupB(),p.minimumOrders(),p.age(),p.effectiveFrom(),p.effectiveTo(),p.proposedAction(),p.requiredFacts());
        var changed=new KnowledgeRuleCandidate(c.id(),c.knowledgeId(),c.version(),c.knowledge(),c.knowledgeHash(),future,hash(json.write(future)),c.cases(),c.actorId(),c.actor(),c.createdAt(),c.reason());
        jdbc.update("update RHN_AUD_KNOW_RULE set JSON_CONTENT=? where ID_TNT=? and ID_KNOW_RULE=?",json.write(changed),T,c.id());
        var s=save(changed,0,fixture("预期不可评价","UNAVAILABLE",List.of()));
        assertThatThrownBy(()->execute(changed,s)).hasMessageContaining("不能将执行器不兼容当作样例通过");
        var corrupt=json.write(changed).replace(changed.programHash(),"f".repeat(64));
        jdbc.update("update RHN_AUD_KNOW_RULE set JSON_CONTENT=? where ID_TNT=? and ID_KNOW_RULE=?",corrupt,T,c.id());
        assertThatThrownBy(()->tests.suites(c.id(),0)).hasMessageContaining("冻结候选身份或指纹不一致");
    }
}
