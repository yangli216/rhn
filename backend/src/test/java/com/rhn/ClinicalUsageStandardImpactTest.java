package com.rhn;

import com.rhn.platform.masterdata.api.*;
import com.rhn.platform.masterdata.api.OrderFrequencyCommands.*;
import com.rhn.platform.masterdata.application.ClinicalUsageStandardService;
import com.rhn.platform.masterdata.application.OrderFrequencyService;
import com.rhn.platform.masterdata.infrastructure.ClinicalSemanticHistory;
import com.rhn.platform.masterdata.web.ClinicalSemanticImpactController;
import com.rhn.quality.medication.api.MedicationKnowledgeDraftContracts.*;
import com.rhn.quality.medication.api.MedicationRuleCatalogContracts.*;
import com.rhn.quality.medication.api.MedicationWorkbenchContracts.*;
import com.rhn.quality.medication.infrastructure.*;
import com.rhn.shared.context.*;
import com.rhn.shared.id.GlobalIds;
import com.rhn.shared.json.JsonCodec;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import static org.mockito.Mockito.when;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ResetDatabaseBeforeEachTestMethod
class ClinicalUsageStandardImpactTest extends RhnIntegrationTestSupport {
    @Autowired ClinicalUsageStandardService standards;
    @Autowired org.springframework.beans.factory.ObjectProvider<ClinicalSemanticImpactContributor> contributors;
    @Autowired ClinicalSemanticHistory history;
    @Autowired OrderFrequencyService frequencies;
    @Autowired MedicationKnowledgeDraftStore drafts;
    @Autowired MedicationWorkbenchStore candidates;
    @Autowired MedicationRuleGovernanceStore governance;
    @Autowired CatalogLifecycleDirectory catalog;
    @Autowired MedicationRouteDirectory routes;
    @Autowired JdbcTemplate jdbc;
    @Autowired JsonCodec codec;
    @MockitoBean ExecutionContextProvider contexts;
    static final Long T=Long.valueOf(TENANT);
    static final String PATH="/api/platform/master-data/clinical-semantics/impact/references";
    @BeforeEach void setup() {context(T,true);}
    void context(Long tenant,boolean manage) {when(contexts.requireCurrent()).thenReturn(new ExecutionContext(tenant,7L,"impact-reviewer","test",manage?Set.of("MASTER_DATA.MANAGE"):Set.of(),Long.valueOf(ORGANIZATION),Long.valueOf(DEPARTMENT),"DEPARTMENT",Set.of(),Set.of()));}
    OrderFrequencyViews.FrequencyView frequency() {
        return frequencies.create(new FrequencyCommand("LOCALIMPACT","合成影响频次",null,null,"TIMES_PER_PERIOD",2,BigDecimal.ONE,"D","STANDARD_TIME","08:00,20:00",true,true,true,true,false,false,true,500,"ACTIVE",LocalDate.of(2026,1,1),null));
    }
    ClinicalSemanticDependencyReport report(String kind,String id,String object,boolean history,int page,int size) {return new ClinicalSemanticImpactController(contributors,contexts,standards).references(kind,id,object,history,page,size);}
    Long oral() {return routes.resolveActive(T,"ORAL","OUTPATIENT",LocalDate.now()).orElseThrow().id();}
    @Test void frequency_inventory_is_full_tenant_includes_inactive_products_configs_and_frozen_history_without_writes() throws Exception {
        var f=frequency();String id=f.id().toString();
        frequencies.createConfiguration(f.id(),new ConfigurationCommand(Long.valueOf(ORGANIZATION),Long.valueOf(DEPARTMENT),null,"停用配置","09:00,21:00","REMAINING_SLOTS",false,"INACTIVE",LocalDate.of(2026,1,1),null));
        var meds=new ArrayList<>(jdbc.queryForList("select ID_MED from RHN_BD_MED where ID_TNT=? order by ID_MED fetch first 45 rows only",Long.class,T));
        Long productMed=jdbc.queryForObject("select min(ID_MED) from RHN_BD_MED_PRODUCT where ID_TNT=?",Long.class,T);
        if(!meds.contains(productMed)) meds.set(44,productMed);
        for(var med:meds) jdbc.update("update RHN_BD_MED set ID_ORDER_FREQ_DEFAULT=?,DEFAULT_FREQUENCY=? where ID_MED=?",f.id(),f.code(),med);
        jdbc.update("update RHN_BD_MED set SD_STATUS='INACTIVE' where ID_MED=?",meds.getFirst());
        // Older records can retain only a code, but must be labelled as default-value references.
        jdbc.update("update RHN_BD_MED set ID_ORDER_FREQ_DEFAULT=null where ID_MED=?",meds.get(1));
        history.append(T,7L,"MEDICATION",meds.getFirst().toString(),"frozen-med-hash","UPDATE","test",codec.write(Map.of("id",meds.getFirst(),"name","合成旧药品","defaultFrequencyId",f.id(),"defaultFrequency",f.code())));
        var before=jdbc.queryForList("select * from RHN_BD_CLIN_SEM_VER where ID_TNT=? order by ID_CLIN_SEM_VER",T);
        var last=report("FREQUENCY",id,"MEDICATION",true,2,20);
        assertThat(last.totalElements()).isEqualTo(45);assertThat(last.content()).hasSize(5);assertThat(last.totals().get("MEDICATION")).isEqualTo(45);
        assertThat(report("FREQUENCY",id,"MEDICATION",true,0,100).content()).anyMatch(r->r.id().equals(meds.getFirst().toString())&&r.status().equals("INACTIVE"));
        assertThat(report("FREQUENCY",id,"PRODUCT",true,0,100).content()).isNotEmpty().allMatch(r->r.relation().equals("INDIRECT_REFERENCE"));
        assertThat(report("FREQUENCY",id,"FREQUENCY_CONFIGURATION",true,0,100).content()).singleElement().satisfies(r->{assertThat(r.status()).isEqualTo("INACTIVE");assertThat(r.references().getFirst().note()).contains("09:00");});
        var frozen=report("FREQUENCY",id,"SEMANTIC_VERSION",true,0,100);
        assertThat(frozen.content()).hasSize(3).allMatch(r->r.historical());
        assertThat(frozen.content()).anyMatch(r->"frozen-med-hash".equals(r.version()));
        var hidden=report("FREQUENCY",id,"SEMANTIC_VERSION",false,0,100);
        assertThat(hidden.content()).isEmpty();assertThat(hidden.totals()).isEqualTo(last.totals());
        mockMvc.perform(get(PATH).with(rhnWorkContext()).param("kind","FREQUENCY").param("conceptId",id).param("objectKind","MEDICATION").param("page","2"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(45)).andExpect(jsonPath("$.content.length()").value(5))
                .andExpect(jsonPath("$.organizationId").value(ORGANIZATION)).andExpect(jsonPath("$.departmentId").value(DEPARTMENT));
        assertThat(jdbc.queryForList("select * from RHN_BD_CLIN_SEM_VER where ID_TNT=? order by ID_CLIN_SEM_VER",T)).isEqualTo(before);
        assertThat(drafts.allVersions(T)).isEmpty();
    }
    @Test void unit_aliases_match_the_same_unit_but_never_package_counts_or_other_dimensions() {
        var meds=jdbc.queryForList("select ID_MED from RHN_BD_MED where ID_TNT=? order by ID_MED fetch first 4 rows only",Long.class,T);
        var units=List.of("毫克","mg","g","mL");
        for(int i=0;i<meds.size();i++) jdbc.update("update RHN_BD_MED set QTY_DEFAULT_DOSE=1,DEFAULT_DOSE_UNIT=?,QTY_STRENGTH_VAL=1,STRENGTH_UNIT='片' where ID_MED=?",units.get(i),meds.get(i));
        var result=report("UNIT","毫克","MEDICATION",true,0,100);
        assertThat(result.scope().conceptId()).isEqualTo("UCUM:mg");
        assertThat(result.content()).extracting(r->r.id()).contains(meds.get(0).toString(),meds.get(1).toString()).doesNotContain(meds.get(2).toString(),meds.get(3).toString());
        assertThat(result.coverage()).anyMatch(c->"ACTIVE_ORDERS".equals(c.area()) && "UNAVAILABLE".equals(c.coverage()) && c.activeCount()==null);
        assertThatThrownBy(()->report("UNIT","片","ALL",true,0,20)).hasMessageContaining("包装单位");
    }
    Version knowledge(Long id,int version,Long route,String code,String mode) {
        var base=MedicationKnowledgeDraftModelTest.duplicate();
        var body=MedicationKnowledgeDraftModelTest.conditions(base,new Conditions("ALL",null,null,null,new RouteCondition(mode,List.of(code)),MedicationKnowledgeDraftModelTest.ALL,""));
        var refs=route==null?List.<MedicationRouteDirectory.RouteSnapshot>of():List.of(new MedicationRouteDirectory.RouteSnapshot(route,code,"保存的途径","OLD.ROUTE","frozen-v1","NONE"));
        return new Version(id,version,"DRAFT",body,new Assessment(true,List.of(),"合成知识",List.of(),List.of(),refs,List.of()),7L,"作者",Instant.now(),"测试");
    }
    @Test void route_knowledge_keeps_all_versions_and_frozen_identity_when_current_code_has_changed() {
        var oral=oral();
        for(int i=1;i<=55;i++) drafts.append(T,knowledge(900L,i,oral,"OLD-ORAL","LIST"));
        drafts.append(T,knowledge(901L,1,null,"ORAL","LIST")); // Same literal code, unresolved identity.
        drafts.append(T,knowledge(902L,1,null,"","ALL"));
        drafts.append(T,knowledge(903L,1,999999L,"OTHER","LIST")); // Unrelated explicit route.
        var result=report("ROUTE",oral.toString(),"KNOWLEDGE",true,2,20);
        assertThat(result.totalElements()).isEqualTo(57);assertThat(result.content()).hasSize(17);
        var all=report("ROUTE",oral.toString(),"KNOWLEDGE",true,0,100);
        assertThat(all.content()).filteredOn(r->r.id().equals("900")).hasSize(55).allSatisfy(r->{assertThat(r.relation()).isEqualTo("FROZEN_REFERENCE");assertThat(r.references().getFirst().code()).isEqualTo("OLD-ORAL");assertThat(r.references().getFirst().version()).isEqualTo("frozen-v1");});
        assertThat(all.content()).filteredOn(r->!r.id().equals("900")).allMatch(r->r.relation().equals("POTENTIAL"));
        var current=report("ROUTE",oral.toString(),"KNOWLEDGE",false,0,100);
        assertThat(current.content()).hasSize(3);assertThat(current.totals()).isEqualTo(all.totals());
        assertThat(drafts.allVersions(T)).hasSize(58);
    }
    Candidate candidate(Long id,Long parent,int version,Long med) {
        var snapshot=catalog.requireMedication(T,med);
        var k=new MedicationKnowledgeDirectory.Knowledge(snapshot,0,"LOCAL",Instant.now(),List.of(),List.of(),List.of(),null);
        return new Candidate(id,parent,version,"合成需求","测试","MANUAL",Instant.now(),new RuleSpec("EXACT_GENERIC_DUPLICATE","合成规则","测试",2,"提示","WARN"),List.of(k),"CANDIDATE");
    }
    @Test void rule_versions_and_orphaned_releases_use_frozen_defaults_and_keep_potential_dependencies() {
        var f=frequency();Long med=362387869795201L;
        jdbc.update("update RHN_BD_MED set ID_ORDER_FREQ_DEFAULT=?,DEFAULT_FREQUENCY=? where ID_MED=?",f.id(),f.code(),med);
        Long root=GlobalIds.next(),child=GlobalIds.next();var old=candidate(root,null,1,med);
        candidates.append(T,7L,old);
        var now=Instant.now();var releases=List.of(
                new Deployment(11L,root.toString(),1,"ENFORCED","ACTIVE","WARN",8L,9L,now.minusSeconds(60),null,7L,now,"test",old,null),
                new Deployment(12L,root.toString(),1,"SHADOW","ACTIVE","WARN",8L,9L,now.plusSeconds(3600),null,7L,now,"test",old,null),
                new Deployment(13L,root.toString(),1,"ENFORCED","ACTIVE","WARN",8L,9L,now.minusSeconds(120),now.minusSeconds(60),7L,now,"test",old,null),
                new Deployment(14L,root.toString(),1,"SHADOW","PAUSED","WARN",8L,9L,now.minusSeconds(60),null,7L,now,"test",old,null));
        governance.save(T,"CANDIDATE:missing",0,new Governance(List.of(),releases,List.of()));
        jdbc.update("update RHN_BD_MED set ID_ORDER_FREQ_DEFAULT=null,DEFAULT_FREQUENCY='OTHER' where ID_MED=?",med);
        candidates.append(T,7L,candidate(child,root,2,med));
        var versions=report("FREQUENCY",f.id().toString(),"RULE_VERSION",true,0,100);
        assertThat(versions.content()).filteredOn(r->r.id().equals(root.toString())).singleElement().satisfies(r->{assertThat(r.historical()).isTrue();assertThat(r.relation()).isEqualTo("FROZEN_REFERENCE");});
        assertThat(versions.content()).filteredOn(r->r.id().equals(child.toString())).singleElement().satisfies(r->assertThat(r.relation()).isEqualTo("POTENTIAL"));
        assertThat(versions.content()).anyMatch(r->r.parentId().startsWith("BUILTIN:")&&r.relation().equals("POTENTIAL"));
        var storedBefore=governance.read(T,"CANDIDATE:missing").state();
        var published=report("FREQUENCY",f.id().toString(),"DEPLOYMENT",true,0,100);
        assertThat(published.content()).hasSize(4).allMatch(r->r.name().contains("目录条目缺失")&&r.relation().equals("FROZEN_REFERENCE"));
        assertThat(published.content()).extracting(r->r.status()).containsExactlyInAnyOrder("ACTIVE","SCHEDULED","EXPIRED","PAUSED");
        assertThat(report("FREQUENCY",f.id().toString(),"DEPLOYMENT",false,0,100).content()).hasSize(2);
        assertThat(governance.read(T,"CANDIDATE:missing").state()).isEqualTo(storedBefore);
    }
    @Test void missing_current_definitions_keep_id_based_history_and_malformed_snapshots_are_partial_not_zero_impact() {
        history.append(T,7L,"FREQUENCY_DEFINITION","999999","old-frequency-hash","UPDATE","test","{\"name\":\"已删除频次\",\"code\":\"OLD\"}");
        history.append(T,7L,"MEDICATION","999998","broken-hash","UPDATE","test","not-json");
        var result=report("FREQUENCY","999999","SEMANTIC_VERSION",true,0,100);
        assertThat(result.scope().status()).isEqualTo("MISSING");
        assertThat(result.content()).singleElement().satisfies(r->assertThat(r.version()).isEqualTo("old-frequency-hash"));
        assertThat(result.coverage()).anyMatch(c->c.area().equals("MASTER_DATA_REFERENCES")&&c.coverage().equals("PARTIAL")&&c.note().contains("1 条"));
    }
    @Test void tenant_permission_route_visibility_and_query_boundaries_are_enforced() throws Exception {
        var f=frequency();var route=oral();drafts.append(T,knowledge(900L,1,route,"ORAL","LIST"));
        context(9999L,true);
        assertThat(standards.resolve("FREQUENCY",f.id().toString()).status()).isEqualTo("MISSING");
        assertThat(report("ROUTE",route.toString(),"KNOWLEDGE",true,0,100).content()).isEmpty();
        assertThat(report("FREQUENCY",f.id().toString(),"SEMANTIC_VERSION",true,0,100).content()).isEmpty();
        context(T,false);assertThatThrownBy(()->report("UNIT","mg","ALL",true,0,20)).hasMessageContaining("权限");
        assertThat(standards.describe("UNIT","mg").coverage()).isEqualTo("UNAVAILABLE");
        context(T,true);
        jdbc.update("update RHN_BD_CODE_SYSTEM set SD_SCOPE_TYPE='TENANT',ID_SCOPE=9999 where ID_CODE_SYSTEM=(select ID_CODE_SYSTEM from RHN_BD_CONCEPT where ID_CONCEPT=?)",route);
        assertThatThrownBy(()->standards.resolve("ROUTE",route.toString())).hasMessageContaining("当前租户可见");
        mockMvc.perform(get(PATH).with(rhnWorkContext()).param("kind","FREQUENCY").param("conceptId",f.id().toString()).param("page","-1")).andExpect(status().isBadRequest());
        mockMvc.perform(get(PATH).with(rhnWorkContext()).param("kind","FREQUENCY").param("conceptId",f.id().toString()).param("objectKind","BAD")).andExpect(status().isBadRequest());
        mockMvc.perform(get(PATH).with(rhnWorkContext()).param("kind","ROUTE").param("conceptId","x")).andExpect(status().isBadRequest());
        mockMvc.perform(get(PATH).header("X-Tenant-Id",TENANT).param("kind","UNIT").param("conceptId","mg")).andExpect(status().isUnauthorized());
    }
    @Test void failed_contributors_do_not_erase_other_results_or_report_a_successful_empty_inventory() {
        var f=frequency();
        @SuppressWarnings("unchecked") var contributors=org.mockito.Mockito.mock(org.springframework.beans.factory.ObjectProvider.class);
        ClinicalSemanticImpactContributor legacy=(kind,id)->new ClinicalSemanticImpactContributor.Impact("LEGACY","CURRENT_WORK_SCOPE",2L,List.of(),true,"旧接口只提供数量");
        ClinicalSemanticImpactContributor failed=(kind,id)->{throw new IllegalStateException("synthetic unavailable source");};
        when(contributors.orderedStream()).thenReturn(java.util.stream.Stream.of(standards,legacy,failed));
        var controller=new ClinicalSemanticImpactController(contributors,contexts,standards);
        var result=controller.references("FREQUENCY",f.id().toString(),"SEMANTIC_VERSION",true,0,20);
        assertThat(result.content()).isNotEmpty();
        assertThat(result.coverage()).anyMatch(c->c.area().equals("LEGACY")&&Long.valueOf(2).equals(c.activeCount()));
        assertThat(result.coverage()).anyMatch(c->c.area().equals("DEPENDENCY_SOURCE_UNAVAILABLE")&&c.coverage().equals("UNAVAILABLE")&&c.activeCount()==null);
    }
}
