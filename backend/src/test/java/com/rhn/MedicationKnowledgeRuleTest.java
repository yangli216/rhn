package com.rhn;

import com.rhn.quality.medication.api.MedicationKnowledgeDraftContracts.*;
import com.rhn.quality.medication.api.MedicationKnowledgeRuleContracts.*;
import com.rhn.quality.medication.api.MedicationRuleCatalogContracts.*;
import com.rhn.quality.medication.application.*;
import com.rhn.quality.medication.infrastructure.MedicationKnowledgeRuleStore;
import com.rhn.platform.masterdata.api.MedicationStandardDependencyDirectory.Scope;
import com.rhn.platform.masterdata.api.StandardMedicationReferenceDirectory;
import com.rhn.shared.context.*;
import com.rhn.shared.json.JsonCodec;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import java.util.*;
import java.util.concurrent.*;
import static com.rhn.MedicationKnowledgeDraftModelTest.*;
import static org.mockito.Mockito.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ResetDatabaseBeforeEachTestMethod
class MedicationKnowledgeRuleTest extends RhnIntegrationTestSupport {
    @Autowired MedicationKnowledgeRuleService rules;
    @Autowired MedicationKnowledgeDraftService drafts;
    @Autowired MedicationKnowledgeRuleStore store;
    @Autowired MedicationRuleCatalogService catalog;
    @Autowired MedicationStandardImpactService impact;
    @Autowired StandardMedicationReferenceDirectory standards;
    @Autowired JsonCodec codec;
    @MockitoBean ExecutionContextProvider contexts;
    @MockitoBean com.rhn.platform.masterdata.application.MedicationRouteService routes;
    static final Long T=Long.valueOf(TENANT);
    @BeforeEach void context() {context(T,true);}
    void context(Long tenant,boolean manage) {when(contexts.requireCurrent()).thenReturn(new ExecutionContext(tenant,7L,"rule-author","test",manage?Set.of("MASTER_DATA.MANAGE"):Set.of(),Long.valueOf(ORGANIZATION),Long.valueOf(DEPARTMENT),"DEPARTMENT",Set.of(),Set.of()));}
    Version save(Body body) {return drafts.save(null,new Save(0,body,"合成测试，非临床依据")).saved();}
    KnowledgeRuleCandidate create(Version v) {var p=rules.preview(v.id(),v.version());return rules.create(v.id(),new Create(v.version(),p.programHash(),"核对合成表达"));}
    CatalogEntry entry(Long id) {return catalog.catalog().rules().stream().filter(e->e.key().equals("KNOWLEDGE:"+id)).findFirst().orElseThrow();}
    CatalogCommand command(CatalogEntry e,String operation) {return new CatalogCommand(e.revision(),operation,e.versions().getFirst().id(),null,"测试管理",null,List.of(),true,true,"SHADOW",Long.valueOf(ORGANIZATION),Long.valueOf(DEPARTMENT),null,null);}

    @Test void universal_knowledge_compiles_without_local_medications_and_versions_are_immutable() {
        var source=save(duplicate());var preview=rules.preview(source.id(),1);
        assertThat(preview.ready()).isTrue();assertThat(store.all(T)).isEmpty();
        assertThat(preview.program().operator()).isEqualTo(Operator.SAME_STANDARD_ENTRY);
        assertThat(preview.program().groupA().targets()).isEmpty();
        var first=create(source);
        assertThat(codec.read(codec.write(first),KnowledgeRuleCandidate.class)).isEqualTo(first);
        assertThat(first.knowledge()).isEqualTo(source);assertThat(first.cases()).allMatch(TestCase::passed);
        assertThat(create(source)).isEqualTo(first);assertThat(store.all(T)).hasSize(1);
        var next=drafts.save(source.id(),new Save(1,conditions(duplicate(),new Conditions("RANGE","YEAR",18,65,ALL,ALL,"")),"增加合成年龄范围")).saved();
        var second=create(next);
        assertThat(second.version()).isEqualTo(2);assertThat(second.programHash()).isNotEqualTo(first.programHash());
        assertThat(store.versions(T,source.id())).containsExactly(second,first);
        assertThat(entry(source.id()).versions()).extracting(CatalogVersion::reviewStatus).containsExactly("DRAFT","DRAFT");
    }
    @Test void stale_previews_and_unstructured_conditions_cannot_create_candidates() {
        var source=save(duplicate());var p=rules.preview(source.id(),1);
        assertThatThrownBy(()->rules.create(source.id(),new Create(1,"f".repeat(64),"测试"))).hasMessageContaining("表达已变化");
        drafts.save(source.id(),new Save(1,conditions(duplicate(),new Conditions("ALL",null,null,null,ALL,ALL,"需肾功能异常")),"待结构化条件"));
        assertThatThrownBy(()->rules.create(source.id(),new Create(1,p.programHash(),"测试"))).hasMessageContaining("知识版本已变化");
        assertThat(rules.preview(source.id(),2).ready()).isFalse();
        assertThatThrownBy(()->rules.create(source.id(),new Create(2,p.programHash(),"测试"))).hasMessageContaining("缺口");
        assertThat(store.all(T)).isEmpty();
    }
    @Test void changed_route_versions_block_creation_without_rewriting_frozen_candidate() {
        var route=new com.rhn.platform.masterdata.api.MedicationRouteDirectory.RouteSnapshot(1L,"PO","测试口服","R","1","NONE");
        when(routes.resolveActive(any(),eq("PO"),any(),any())).thenReturn(Optional.of(route));
        var source=save(conditions(duplicate(),new Conditions("ALL",null,null,null,new RouteCondition("LIST",List.of("PO")),ALL,"")));
        var candidate=create(source);
        when(routes.resolveActive(any(),eq("PO"),any(),any())).thenReturn(Optional.of(new com.rhn.platform.masterdata.api.MedicationRouteDirectory.RouteSnapshot(1L,"PO","修订口服","R","2","NONE")));
        assertThat(rules.preview(source.id(),1).issues()).extracting(Issue::code).contains("STALE_ROUTE");
        assertThatThrownBy(()->rules.create(source.id(),new Create(1,candidate.programHash(),"测试"))).hasMessageContaining("缺口");
        assertThat(store.all(T)).containsExactly(candidate);
    }
    @Test void directory_exposes_candidate_but_no_operation_can_publish_or_approve_it() {
        var source=save(duplicate());var candidate=create(source);var e=entry(source.id());
        assertThat(e.origin()).isEqualTo("KNOWLEDGE");assertThat(e.versions().getFirst().knowledgeCandidate()).isEqualTo(candidate);
        assertThat(e.deployments()).isEmpty();
        for(var op:List.of("SUBMIT","APPROVE","DEPLOY","ROLLBACK","PAUSE"))
            assertThatThrownBy(()->catalog.command(e.key(),command(e,op))).hasMessageContaining("旁路请使用");
        var retired=catalog.command(e.key(),command(e,"RETIRE"));
        assertThat(retired.versions().getFirst().reviewStatus()).isEqualTo("RETIRED");
        assertThat(retired.deployments()).isEmpty();assertThat(retired.history()).singleElement().satisfies(h->assertThat(h.operation()).isEqualTo("RETIRE"));
        assertThat(store.all(T)).containsExactly(candidate);
    }
    @Test void concurrent_creation_returns_one_identical_candidate() throws Exception {
        var source=save(duplicate());var p=rules.preview(source.id(),1);var gate=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(2)) {
            Callable<KnowledgeRuleCandidate> action=()->{gate.await();return rules.create(source.id(),new Create(1,p.programHash(),"并发合成测试"));};
            var a=pool.submit(action);var b=pool.submit(action);gate.countDown();
            assertThat(a.get(20,TimeUnit.SECONDS)).isEqualTo(b.get(20,TimeUnit.SECONDS));
        }
        assertThat(store.versions(T,source.id())).hasSize(1);
    }
    @Test void tenant_permissions_and_http_contract_are_enforced() throws Exception {
        var source=save(duplicate());String path="/api/quality/medication-knowledge-drafts/"+source.id()+"/rule-candidates";
        mockMvc.perform(get(path+"/preview").with(rhnWorkContext()).param("expectedVersion","1")).andExpect(status().isOk()).andExpect(jsonPath("$.ready").value(true));
        var p=rules.preview(source.id(),1);
        mockMvc.perform(post(path).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(codec.write(new Create(1,p.programHash(),"HTTP 合成测试"))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.program.operator").value("SAME_STANDARD_ENTRY"));
        context(9999L,true);assertThat(catalog.catalog().rules()).noneMatch(e->e.origin().equals("KNOWLEDGE"));
        assertThatThrownBy(()->rules.preview(source.id(),1)).hasMessageContaining("当前租户");
        assertThatThrownBy(()->rules.create(source.id(),new Create(1,p.programHash(),"越权"))).hasMessageContaining("当前租户");
        context(T,false);assertThatThrownBy(()->rules.preview(source.id(),1)).hasMessageContaining("权限");
        assertThatThrownBy(()->rules.create(source.id(),new Create(1,p.programHash(),"越权"))).hasMessageContaining("权限");
    }
    @Test void explicit_standard_dependencies_survive_source_edits() {
        var r=standards.requireSpecification("STD-9405B86DD5B404C44E1B92B5");var b=duplicate();
        var body=new Body(b.title(),b.kind(),"EXPLICIT_GROUP",List.of(new Target("ENTRY",r.specificationId(),r.catalogId(),r.catalogVersion(),r.contentHash())),List.of(),2,b.exposureScope(),b.conditions(),b.evidence(),b.clinicalMeaning(),b.severity(),b.proposedAction());
        var source=save(body);var candidate=create(source);
        drafts.save(source.id(),new Save(1,duplicate(),"修改来源，旧规则身份不变"));
        var report=impact.inspect(new Scope(r.catalogId(),r.entryId(),"OTHER-SPEC"),"RULE_VERSION",true,0,100);
        assertThat(report.content()).filteredOn(i->i.id().equals(candidate.id().toString())).singleElement().satisfies(i->assertThat(i.traces()).anyMatch(t->r.contentHash().equals(t.contentHash())));
        assertThat(entry(source.id()).versions().getFirst().knowledgeCandidate().knowledge().version()).isEqualTo(1);
    }
}
