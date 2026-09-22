package com.rhn;

import com.rhn.platform.masterdata.api.*;
import com.rhn.platform.masterdata.api.MedicationStandardDependencyDirectory.Scope;
import com.rhn.platform.masterdata.domain.MedicationStandardSource;
import com.rhn.platform.masterdata.infrastructure.MedicationStandardSourceRepository;
import com.rhn.quality.medication.api.MedicationKnowledgeDraftContracts.*;
import com.rhn.quality.medication.api.MedicationRuleCatalogContracts.*;
import com.rhn.quality.medication.api.MedicationWorkbenchContracts.*;
import com.rhn.quality.medication.application.MedicationStandardImpactService;
import com.rhn.quality.medication.infrastructure.*;
import com.rhn.shared.context.*;
import com.rhn.shared.id.GlobalIds;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import java.time.Instant;
import java.util.*;
import static org.mockito.Mockito.when;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ResetDatabaseBeforeEachTestMethod
class MedicationStandardImpactTest extends RhnIntegrationTestSupport {
    @Autowired MedicationStandardImpactService impact;
    @Autowired MedicationStandardSourceRepository sources;
    @Autowired MedicationKnowledgeDraftStore drafts;
    @Autowired MedicationWorkbenchStore candidates;
    @Autowired MedicationRuleGovernanceStore governance;
    @Autowired CatalogLifecycleDirectory catalog;
    @Autowired JdbcTemplate jdbc;
    @MockitoBean ExecutionContextProvider contexts;
    static final Long TENANT_ID=Long.valueOf(TENANT);
    static final Scope ALL=new Scope("TEST-CATALOG",null,null);
    static final String PATH="/api/quality/medication-standard-impact";
    @BeforeEach void setup() {context(TENANT_ID,true);}
    void context(Long tenant,boolean allowed) {when(contexts.requireCurrent()).thenReturn(new ExecutionContext(tenant,7L,"impact-reviewer","impact-test",allowed?Set.of("MASTER_DATA.MANAGE"):Set.of(),Long.valueOf(ORGANIZATION),Long.valueOf(DEPARTMENT),"DEPARTMENT",Set.of(),Set.of()));}
    void source(Long med,String entry,String spec,String version) {sources.saveAndFlush(new MedicationStandardSource(TENANT_ID,med,ALL.catalogId(),version,entry,spec,"old-content-hash",7L));}
    Version knowledge(Long id,int version,String entry,String spec,String level) {
        var base=MedicationKnowledgeDraftModelTest.duplicate();
        var target=new Target(level,spec,ALL.catalogId(),"old-catalog","old-hash");
        var body=new Body("合成知识",base.kind(),"EXPLICIT_GROUP",List.of(target),List.of(),2,base.exposureScope(),base.conditions(),base.evidence(),base.clinicalMeaning(),base.severity(),base.proposedAction());
        var ref=new StandardMedicationReferenceDirectory.Reference(ALL.catalogId(),"old-catalog","old-hash","old-source",entry,spec,"合成药品","TABLET","合成规格");
        var assessment=new Assessment(true,List.of(),"合成说明",List.of(new ResolvedTarget(level,ref)),List.of(),List.of(),List.of());
        return new Version(id,version,"DRAFT",body,assessment,7L,"作者",Instant.now(),"测试");
    }
    @Test void full_inventory_includes_inactive_stale_relations_products_and_does_not_write() throws Exception {
        var meds=new ArrayList<>(jdbc.queryForList("select ID_MED from RHN_BD_MED where ID_TNT=? order by ID_MED fetch first 45 rows only",Long.class,TENANT_ID));
        Long productMed=jdbc.queryForObject("select min(ID_MED) from RHN_BD_MED_PRODUCT where ID_TNT=?",Long.class,TENANT_ID);
        if(!meds.contains(productMed)) meds.set(44,productMed);
        assertThat(meds).hasSize(45);
        for(int i=0;i<meds.size();i++) source(meds.get(i),"E","S"+i,"old");
        source(meds.getFirst(),"E","OTHER-SPEC","older");
        jdbc.update("update RHN_BD_MED set SD_STATUS='INACTIVE' where ID_MED=?",meds.getFirst());
        var before=jdbc.queryForList("select * from RHN_BD_MED_STD_SOURCE where ID_TNT=? order by ID_MED_STD_SOURCE",TENANT_ID);
        var report=impact.inspect(ALL,"MEDICATION",true,2,20);
        assertThat(report.totalElements()).isEqualTo(45);assertThat(report.content()).hasSize(5);assertThat(report.totals().get("MEDICATION")).isEqualTo(45);
        var first=impact.inspect(ALL,"MEDICATION",true,0,100);
        assertThat(first.content()).filteredOn(i->i.id().equals(meds.getFirst().toString())).singleElement().satisfies(i->{assertThat(i.status()).isEqualTo("INACTIVE");assertThat(i.traces()).hasSize(2);});
        assertThat(impact.inspect(ALL,"PRODUCT",true,0,100).content()).isNotEmpty().allMatch(i->i.traces().stream().allMatch(t->t.relation().equals("VIA_MEDICATION")));
        mockMvc.perform(get(PATH).with(rhnWorkContext()).param("catalogId",ALL.catalogId()).param("kind","MEDICATION").param("page","2")).andExpect(status().isOk()).andExpect(jsonPath("$.totals.MEDICATION").isNumber());
        assertThat(jdbc.queryForList("select * from RHN_BD_MED_STD_SOURCE where ID_TNT=? order by ID_MED_STD_SOURCE",TENANT_ID)).isEqualTo(before);
        assertThat(drafts.allVersions(TENANT_ID)).isEmpty();
    }
    @Test void all_knowledge_versions_are_counted_and_entry_scopes_cover_other_specifications() {
        for(int i=1;i<=55;i++) drafts.append(TENANT_ID,knowledge(900L,i,"E","ANCHOR-SPEC","ENTRY"));
        drafts.append(TENANT_ID,knowledge(901L,1,"E","ONLY-SPEC","SPECIFICATION"));
        var scope=new Scope(ALL.catalogId(),"E","OTHER-SPEC");
        var report=impact.inspect(scope,"KNOWLEDGE",true,2,20);
        assertThat(report.totalElements()).isEqualTo(55);assertThat(report.content()).hasSize(15);assertThat(report.totals().get("KNOWLEDGE")).isEqualTo(55);
        assertThat(report.content()).allMatch(i->i.traces().getFirst().contentHash().equals("old-hash"));
        var latest=impact.inspect(scope,"KNOWLEDGE",false,0,20);
        assertThat(latest.content()).singleElement().satisfies(i->assertThat(i.version()).isEqualTo("55"));
        assertThat(latest.totals()).isEqualTo(report.totals());
        assertThat(impact.inspect(new Scope(ALL.catalogId(),"OTHER-ENTRY",null),"KNOWLEDGE",true,0,20).content()).isEmpty();
    }
    Candidate candidate(Long id,String refCatalog) {
        var med=catalog.requireMedication(TENANT_ID,362387869795201L);
        var ref=new MedicationStandardReference("LINKED",refCatalog,"old-version","old-hash","E","S",1,"合成药品","TABLET","合成规格",null,null,"UNVERIFIED",List.of());
        var k=new MedicationKnowledgeDirectory.Knowledge(med,0,"STANDARD_LINKED",Instant.now(),List.of(),List.of(),List.of(),ref);
        return new Candidate(id,null,1,"合成需求","合成来源","MANUAL",Instant.now(),new RuleSpec("EXACT_GENERIC_DUPLICATE","合成规则","说明",2,"提示","WARN"),List.of(k),"CANDIDATE");
    }
    @Test void deployments_use_their_frozen_candidate_and_classify_scheduled_expired_and_paused() {
        Long id=GlobalIds.next();candidates.append(TENANT_ID,7L,candidate(id,"OTHER-CATALOG"));
        var frozen=candidate(id,ALL.catalogId());var now=Instant.now();String key="CANDIDATE:"+id;
        var releases=List.of(new Deployment(11L,id.toString(),1,"LIVE","ACTIVE","WARN",8L,9L,now.minusSeconds(60),null,7L,now,"test",frozen,null),
            new Deployment(12L,id.toString(),1,"SHADOW","ACTIVE","WARN",8L,9L,now.plusSeconds(3600),null,7L,now,"test",frozen,null),
            new Deployment(13L,id.toString(),1,"LIVE","ACTIVE","WARN",8L,9L,now.minusSeconds(120),now.minusSeconds(60),7L,now,"test",frozen,null),
            new Deployment(14L,id.toString(),1,"SHADOW","PAUSED","WARN",8L,9L,now.minusSeconds(60),null,7L,now,"test",frozen,null));
        governance.save(TENANT_ID,key,0,new Governance(List.of(),releases,List.of()));
        var storedBefore=governance.read(TENANT_ID,key).state().deployments();
        var report=impact.inspect(ALL,"DEPLOYMENT",true,0,100);
        assertThat(report.content()).hasSize(4).extracting(i->i.status()).containsExactlyInAnyOrder("ACTIVE","SCHEDULED","EXPIRED","PAUSED");
        assertThat(report.content()).allMatch(i->i.matchType().equals("REFERENCED")&&i.traces().getFirst().catalogVersion().equals("old-version"));
        assertThat(impact.inspect(ALL,"DEPLOYMENT",false,0,20).content()).hasSize(2);
        assertThat(impact.inspect(ALL,"RULE_VERSION",true,0,100).content()).noneMatch(i->i.id().equals(id.toString()));
        assertThat(governance.read(TENANT_ID,key).state().deployments()).isEqualTo(storedBefore);
    }
    @Test void orphaned_publication_snapshots_remain_visible_after_the_catalogue_record_is_missing() {
        var frozen=candidate(123456L,ALL.catalogId());var now=Instant.now();
        var deployment=new Deployment(91L,"123456",1,"LIVE","PAUSED","WARN",8L,9L,now.minusSeconds(60),null,7L,now,"历史发布",frozen,null);
        governance.save(TENANT_ID,"CANDIDATE:123456",0,new Governance(List.of(),List.of(deployment),List.of()));
        var result=impact.inspect(ALL,"DEPLOYMENT",true,0,20);
        assertThat(result.content()).singleElement().satisfies(i->{assertThat(i.name()).contains("目录记录缺失");assertThat(i.id()).isEqualTo("91");assertThat(i.matchType()).isEqualTo("REFERENCED");assertThat(i.traces().getFirst().catalogVersion()).isEqualTo("old-version");});
        assertThat(impact.inspect(ALL,"DEPLOYMENT",false,0,20).content()).isEmpty();
    }
    @Test void dynamic_and_unresolved_scopes_remain_potential_not_false_exact_matches() {
        var b=MedicationKnowledgeDraftModelTest.duplicate();
        drafts.append(TENANT_ID,new Version(900L,1,"DRAFT",b,new Assessment(true,List.of(),"动态范围",List.of(),List.of(),List.of(),List.of()),7L,"作者",Instant.now(),"test"));
        var unresolved=knowledge(901L,1,"E","UNKNOWN","ENTRY");
        drafts.append(TENANT_ID,new Version(901L,1,"DRAFT",unresolved.body(),new Assessment(false,List.of(),"无法解析",List.of(),List.of(),List.of(),List.of()),7L,"作者",Instant.now(),"test"));
        var incomplete=candidate(GlobalIds.next(),"OTHER-CATALOG");
        candidates.append(TENANT_ID,7L,new Candidate(incomplete.id(),null,1,incomplete.requirement(),incomplete.source(),incomplete.model(),incomplete.createdAt(),incomplete.rule(),List.of(),"CANDIDATE"));
        var result=impact.inspect(new Scope(ALL.catalogId(),"E","OTHER-SPEC"),"KNOWLEDGE",true,0,20);
        assertThat(result.content()).hasSize(2).allMatch(i->i.matchType().equals("POTENTIAL"));
        assertThat(impact.inspect(ALL,"RULE_VERSION",true,0,100).content()).isNotEmpty().allMatch(i->i.matchType().equals("POTENTIAL"));
    }
    @Test void tenant_permission_and_query_boundaries_are_enforced() throws Exception {
        source(362387869795201L,"E","S","old");drafts.append(TENANT_ID,knowledge(900L,1,"E","S","ENTRY"));
        context(9999L,true);
        assertThat(impact.inspect(ALL,"MEDICATION",true,0,20).content()).isEmpty();assertThat(impact.inspect(ALL,"KNOWLEDGE",true,0,20).content()).isEmpty();
        context(TENANT_ID,false);assertThatThrownBy(()->impact.inspect(ALL,"ALL",true,0,20)).hasMessageContaining("权限");
        context(TENANT_ID,true);
        assertThatThrownBy(()->impact.inspect(ALL,"BAD",true,0,20)).hasMessageContaining("筛选");
        assertThatThrownBy(()->impact.inspect(new Scope("",null,null),"ALL",true,0,20)).hasMessageContaining("请指定目录");
        assertThatThrownBy(()->impact.inspect(new Scope(ALL.catalogId(),null,"S"),"ALL",true,0,20)).hasMessageContaining("所属标准条目");
        mockMvc.perform(get(PATH).with(rhnWorkContext()).param("catalogId",ALL.catalogId()).param("page","-1")).andExpect(status().isBadRequest());
        mockMvc.perform(get(PATH).header("X-Tenant-Id",TENANT).param("catalogId",ALL.catalogId())).andExpect(status().isUnauthorized());
    }
}
