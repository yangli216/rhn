package com.rhn;

import com.rhn.platform.masterdata.api.MedicationStandardRevisionContracts.*;
import com.rhn.platform.masterdata.application.MedicationStandardRevisionService;
import com.rhn.platform.masterdata.domain.MedicationStandardSource;
import com.rhn.platform.masterdata.infrastructure.*;
import com.rhn.shared.context.*;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.json.JsonCodec;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.http.MediaType;
import java.util.*;
import java.util.concurrent.*;
import static org.mockito.Mockito.when;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ResetDatabaseBeforeEachTestMethod
class MedicationStandardRevisionTest extends RhnIntegrationTestSupport {
    static final Long MED=362387880000024L,TENANT_ID=Long.valueOf(TENANT);
    static final String SPEC="STD-9405B86DD5B404C44E1B92B5",PATH="/api/platform/master-data/medications/"+MED+"/standard-revision";
    @Autowired MedicationStandardRevisionService revisions;
    @Autowired com.rhn.quality.medication.application.MedicationStandardImpactService impact;
    @Autowired MedicationStandardSourceRepository sources;
    @Autowired ClinicalSemanticHistory history;
    @Autowired com.rhn.quality.medication.infrastructure.MedicationKnowledgeDraftStore drafts;
    @Autowired com.rhn.quality.medication.infrastructure.MedicationRuleGovernanceStore governance;
    @Autowired JdbcTemplate jdbc;
    @Autowired JsonCodec codec;
    @Autowired PlatformTransactionManager transactions;
    @MockitoBean ExecutionContextProvider contexts;
    @BeforeEach void setup(){context(TENANT_ID,7L,true);sources.saveAndFlush(new MedicationStandardSource(TENANT_ID,MED,"OLD-CATALOG","old","OLD-ENTRY","OLD-SPEC","old-hash",6L));}
    void context(Long tenant,Long actor,boolean manage){when(contexts.requireCurrent()).thenReturn(new ExecutionContext(tenant,actor,"actor-"+actor,"revision-test",manage?Set.of("MASTER_DATA.MANAGE"):Set.of(),Long.valueOf(ORGANIZATION),Long.valueOf(DEPARTMENT),"DEPARTMENT",Set.of(),Set.of()));}
    Submit submit(){var p=revisions.preview(MED,0);return new Submit(p.binding().medication().revision(),p.latest()==null?null:p.latest().id(),p.sourceFingerprint(),p.binding().identity(),SPEC,"按标准原文核对旧关联","已人工核对影响清单，历史快照保留；仅合成测试",true,revisions.impact(MED,SPEC).fingerprint());}
    Review review(Long event,String action){return new Review(event,action,"独立核对并记录处理结论",true,true);}
    @Test void submit_is_non_mutating_and_independent_apply_preserves_business_rows_and_provenance() throws Exception {
        var original=jdbc.queryForMap("select * from RHN_BD_MED where ID_MED=?",MED);var old=revisions.preview(MED,0).currentLinks();
        var pending=revisions.submit(MED,submit());assertThat(pending.latest().status()).isEqualTo("SUBMITTED");assertThat(pending.currentLinks()).isEqualTo(old);assertThat(pending.allowedActions()).containsExactly("CANCEL");
        assertThatThrownBy(()->revisions.review(MED,review(pending.latest().id(),"APPLY"))).hasMessageContaining("另一位");
        context(TENANT_ID,8L,true);assertThat(revisions.preview(MED,0).allowedActions()).contains("APPLY","REJECT");
        mockMvc.perform(post(PATH+"/review").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(codec.write(review(pending.latest().id(),"APPLY"))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.latest.status").value("APPLIED")).andExpect(jsonPath("$.binding.reference.status").value("LINKED"));
        var result=revisions.preview(MED,0);assertThat(result.currentLinks()).singleElement().satisfies(s->{assertThat(s.specificationId()).isEqualTo(SPEC);assertThat(s.createdBy()).isEqualTo(8L);});
        assertThat(result.latest().proposal().previousLinks()).isEqualTo(old);assertThat(result.latest().resultingLinks()).extracting(SourceLink::specificationId).containsExactly(SPEC);
        assertThat(jdbc.queryForMap("select * from RHN_BD_MED where ID_MED=?",MED)).isEqualTo(original);
        assertThat(history.history(TENANT_ID,"MEDICATION",MED.toString(),100)).extracting(v->codec.readTree(v.snapshot()).at("/standardReference/status").asString()).contains("STALE","LINKED");
        var oldImpact=impact.inspect(new com.rhn.platform.masterdata.api.MedicationStandardDependencyDirectory.Scope("OLD-CATALOG","OLD-ENTRY","OLD-SPEC"),"STANDARD_REVISION",true,0,20);
        assertThat(oldImpact.content()).hasSize(2).allMatch(i->i.historical());
        assertThat(oldImpact.content()).flatExtracting(i->i.traces()).anyMatch(t->"old-hash".equals(t.contentHash()));
        assertThat(impact.inspect(oldImpact.scope(),"MEDICATION",true,0,20).content()).isEmpty();
        assertThat(impact.inspect(oldImpact.scope(),"STANDARD_REVISION",false,0,20).content()).isEmpty();
        assertThat(result.eligibleSpecificationIds()).doesNotContain(SPEC);
        assertThatThrownBy(()->revisions.review(MED,review(pending.latest().id(),"APPLY"))).hasMessageContaining("修订记录已变化");
    }
    @Test void stale_source_links_medication_and_occupied_target_cannot_be_applied() {
        var input=submit();sources.saveAndFlush(new MedicationStandardSource(TENANT_ID,MED,"OTHER","1","E","S","hash",7L));
        assertThatThrownBy(()->revisions.submit(MED,input)).hasMessageContaining("已有标准关联已变化");
        var pending=revisions.submit(MED,submit());context(TENANT_ID,8L,true);
        jdbc.update("update RHN_BD_MED set REVISION=REVISION+1 where ID_MED=?",MED);
        assertThat(revisions.preview(MED,0).allowedActions()).doesNotContain("APPLY");
        assertThatThrownBy(()->revisions.review(MED,review(pending.latest().id(),"APPLY"))).hasMessageContaining("药品档案已变化");
        revisions.review(MED,review(pending.latest().id(),"REJECT"));context(TENANT_ID,7L,true);
        var retry=revisions.submit(MED,submit());context(TENANT_ID,8L,true);var identity=retry.binding().identity();
        sources.saveAndFlush(new MedicationStandardSource(TENANT_ID,362387869795201L,identity.catalogId(),identity.catalogVersion(),"E",SPEC,identity.contentHash(),8L));
        assertThatThrownBy(()->revisions.review(MED,review(retry.latest().id(),"APPLY"))).hasMessageContaining("目标规格");
        assertThat(revisions.preview(MED,0).currentLinks()).hasSize(2);assertThat(revisions.preview(MED,0).latest().status()).isEqualTo("SUBMITTED");
    }
    @Test void rejection_and_cancellation_keep_the_proposal_immutable_and_allow_resubmission() {
        var first=revisions.submit(MED,submit());context(TENANT_ID,8L,true);
        assertThatThrownBy(()->revisions.review(MED,new Review(first.latest().id(),"APPLY","未确认",false,true))).hasMessageContaining("复核人须确认");
        var rejected=revisions.review(MED,review(first.latest().id(),"REJECT"));assertThat(rejected.latest().proposal()).isEqualTo(first.latest().proposal());
        context(TENANT_ID,7L,true);var second=revisions.submit(MED,submit());
        var cancelled=revisions.review(MED,review(second.latest().id(),"CANCEL"));assertThat(cancelled.latest().status()).isEqualTo("CANCELLED");assertThat(cancelled.currentLinks()).isEqualTo(first.currentLinks());
        assertThat(cancelled.history()).extracting(Event::status).containsExactly("CANCELLED","SUBMITTED","REJECTED","SUBMITTED");
    }
    @Test void permission_tenant_source_version_and_target_boundaries_are_enforced() throws Exception {
        var input=submit();context(TENANT_ID,null,true);assertThatThrownBy(()->revisions.impact(MED,SPEC)).hasMessageContaining("操作人员身份");context(TENANT_ID,7L,false);assertThatThrownBy(()->revisions.preview(MED,0)).hasMessageContaining("权限");
        context(9999L,7L,true);assertThatThrownBy(()->revisions.preview(MED,0)).hasMessageContaining("当前租户");context(TENANT_ID,7L,true);
        var identity=input.identity();var stale=new com.rhn.platform.masterdata.api.StandardCatalogReview.Identity(identity.catalogId(),identity.catalogVersion(),identity.contentHash(),"old-source");
        assertThatThrownBy(()->revisions.submit(MED,new Submit(input.expectedMedicationRevision(),null,input.expectedSourceFingerprint(),stale,SPEC,input.reason(),input.impactNotes(),true))).hasMessageContaining("来源文件已变化");
        assertThatThrownBy(()->revisions.submit(MED,new Submit(input.expectedMedicationRevision(),null,input.expectedSourceFingerprint(),identity,"UNKNOWN",input.reason(),input.impactNotes(),true))).hasMessageContaining("目标须身份一致");
        assertThatThrownBy(()->revisions.submit(MED,new Submit(input.expectedMedicationRevision(),null,input.expectedSourceFingerprint(),identity,SPEC,input.reason(),"",true))).hasMessageContaining("影响核对说明");
        mockMvc.perform(get(PATH).with(rhnWorkContext()).param("historyPage","-1")).andExpect(status().isBadRequest());
        assertThat(revisions.preview(MED,0).history()).isEmpty();
    }
    @Test void incorrect_parent_entry_can_be_repaired_even_when_specification_and_catalogue_version_match() {
        var identity=revisions.preview(MED,0).binding().identity();
        sources.deleteAll(sources.findByTenantIdAndMedicationId(TENANT_ID,MED));sources.flush();
        sources.saveAndFlush(new MedicationStandardSource(TENANT_ID,MED,identity.catalogId(),identity.catalogVersion(),"WRONG-ENTRY",SPEC,identity.contentHash(),7L));
        assertThat(revisions.preview(MED,0).eligibleSpecificationIds()).contains(SPEC);
        var pending=revisions.submit(MED,submit());context(TENANT_ID,8L,true);
        var applied=revisions.review(MED,review(pending.latest().id(),"APPLY"));
        assertThat(applied.binding().reference().status()).isEqualTo("LINKED");
        assertThat(applied.currentLinks().getFirst().entryId()).isNotEqualTo("WRONG-ENTRY");
        assertThat(applied.eligibleSpecificationIds()).doesNotContain(SPEC);
    }
    @Test void apply_and_history_roll_back_atomically() {
        var first=revisions.submit(MED,submit());context(TENANT_ID,8L,true);
        new TransactionTemplate(transactions).executeWithoutResult(tx->{revisions.review(MED,review(first.latest().id(),"APPLY"));tx.setRollbackOnly();});
        var after=revisions.preview(MED,0);assertThat(after.latest().status()).isEqualTo("SUBMITTED");assertThat(after.currentLinks()).isEqualTo(first.currentLinks());
        assertThat(after.history()).hasSize(1);assertThat(history.history(TENANT_ID,"MEDICATION",MED.toString(),100)).isEmpty();
    }
    void addKnowledge(Long tenant,Long id,int version) {
        var body=MedicationKnowledgeDraftModelTest.duplicate();
        drafts.append(tenant,new com.rhn.quality.medication.api.MedicationKnowledgeDraftContracts.Version(id,version,"DRAFT",body,
            new com.rhn.quality.medication.api.MedicationKnowledgeDraftContracts.Assessment(true,List.of(),"合成通用知识",List.of(),List.of(),List.of(),List.of()),
            7L,"合成作者",java.time.Instant.now(),"隔离测试"));
    }
    @Test void impact_snapshot_is_complete_stable_not_self_referential_and_tenant_scoped() throws Exception {
        for(int i=1;i<=105;i++) addKnowledge(TENANT_ID,900L,i);
        addKnowledge(9999L,901L,1);
        var before=revisions.impact(MED,SPEC);
        assertThat(before.areas()).hasSize(2);
        assertThat(before.areas()).allSatisfy(area->{
            assertThat(area.dependencies()).filteredOn(item->"KNOWLEDGE".equals(item.kind())).hasSize(105).noneMatch(item->"901".equals(item.id()));
            assertThat(area.dependencies()).noneMatch(item->"STANDARD_REVISION".equals(item.kind()));
            assertThat(area.limitations()).isNotEmpty();
        });
        assertThat(revisions.impact(MED,SPEC).fingerprint()).isEqualTo(before.fingerprint());
        mockMvc.perform(get(PATH+"/impact").with(rhnWorkContext()).param("specificationId",SPEC))
            .andExpect(status().isOk()).andExpect(jsonPath("$.fingerprint").value(before.fingerprint()));
        var pending=revisions.submit(MED,submit());
        assertThat(pending.latest().proposal().impact().fingerprint()).isEqualTo(before.fingerprint());
        assertThat(pending.currentImpact().fingerprint()).isEqualTo(before.fingerprint());
        context(TENANT_ID,8L,true);
        assertThat(revisions.preview(MED,0).allowedActions()).contains("APPLY");
        var applied=revisions.review(MED,review(pending.latest().id(),"APPLY"));
        assertThat(applied.latest().proposal().impact()).isEqualTo(pending.latest().proposal().impact());
        assertThat(applied.history()).allSatisfy(event->assertThat(event.proposal().impact()).isEqualTo(pending.latest().proposal().impact()));
    }
    @Test void new_knowledge_after_preview_or_submission_requires_fresh_impact_review() {
        var input=submit();
        var unchecked=new Submit(input.expectedMedicationRevision(),input.expectedEventId(),input.expectedSourceFingerprint(),input.identity(),input.specificationId(),input.reason(),input.impactNotes(),true);
        assertThatThrownBy(()->revisions.submit(MED,unchecked)).hasMessageContaining("影响清单未核对或已变化");
        addKnowledge(TENANT_ID,900L,1);
        assertThatThrownBy(()->revisions.submit(MED,input)).hasMessageContaining("影响清单未核对或已变化");
        assertThat(revisions.preview(MED,0).history()).isEmpty();
        var pending=revisions.submit(MED,submit());var frozen=pending.latest().proposal().impact();addKnowledge(TENANT_ID,900L,2);
        context(TENANT_ID,8L,true);var stale=revisions.preview(MED,0);
        assertThat(stale.allowedActions()).containsExactly("REJECT");assertThat(stale.staleIssues()).anyMatch(note->note.contains("影响清单已变化"));
        assertThat(stale.latest().proposal().impact()).isEqualTo(frozen);assertThat(stale.currentImpact().fingerprint()).isNotEqualTo(frozen.fingerprint());
        assertThatThrownBy(()->revisions.review(MED,review(pending.latest().id(),"APPLY"))).hasMessageContaining("影响清单已变化");
        assertThat(revisions.preview(MED,0).currentLinks()).isEqualTo(pending.currentLinks());
        var rejected=revisions.review(MED,review(pending.latest().id(),"REJECT"));assertThat(rejected.latest().proposal().impact()).isEqualTo(frozen);
        context(TENANT_ID,7L,true);var next=revisions.submit(MED,submit());assertThat(next.latest().proposal().impact().fingerprint()).isNotEqualTo(frozen.fingerprint());
    }
    @Test void deployments_and_product_revisions_change_the_inventory_without_modifying_frozen_proposals() {
        var pending=revisions.submit(MED,submit());var now=java.time.Instant.now();
        var deployment=new com.rhn.quality.medication.api.MedicationRuleCatalogContracts.Deployment(501L,"unknown",1,"SHADOW","ACTIVE","WARN",8L,9L,now.minusSeconds(1),null,7L,now,"合成部署",null,null);
        governance.save(TENANT_ID,"BUILTIN:TEST-IMPACT",0,new com.rhn.quality.medication.api.MedicationRuleCatalogContracts.Governance(List.of(),List.of(deployment),List.of()));
        context(TENANT_ID,8L,true);
        assertThatThrownBy(()->revisions.review(MED,review(pending.latest().id(),"APPLY"))).hasMessageContaining("影响清单已变化");
        revisions.review(MED,review(pending.latest().id(),"REJECT"));context(TENANT_ID,7L,true);
        var active=revisions.submit(MED,submit());
        var paused=new com.rhn.quality.medication.api.MedicationRuleCatalogContracts.Deployment(501L,"unknown",1,"SHADOW","PAUSED","WARN",8L,9L,now.minusSeconds(1),null,7L,now,"合成部署暂停",null,null);
        var saved=governance.read(TENANT_ID,"BUILTIN:TEST-IMPACT");
        governance.save(TENANT_ID,saved.key(),saved.revision(),new com.rhn.quality.medication.api.MedicationRuleCatalogContracts.Governance(List.of(),List.of(paused),List.of()));
        context(TENANT_ID,8L,true);
        assertThatThrownBy(()->revisions.review(MED,review(active.latest().id(),"APPLY"))).hasMessageContaining("影响清单已变化");
        var current=revisions.preview(MED,0);
        assertThat(current.currentImpact().areas().getFirst().dependencies()).hasSize(active.latest().proposal().impact().areas().getFirst().dependencies().size());
        assertThat(active.latest().proposal().impact().areas()).flatExtracting(area->area.dependencies()).filteredOn(item->"501".equals(item.id())).allMatch(item->"ACTIVE".equals(item.status()));
        revisions.review(MED,review(active.latest().id(),"REJECT"));context(TENANT_ID,7L,true);
        Long product=jdbc.queryForObject("select min(ID_CATALOG_ITEM) from RHN_BD_MED_PRODUCT where ID_TNT=?",Long.class,TENANT_ID);
        jdbc.update("update RHN_BD_MED_PRODUCT set ID_MED=? where ID_CATALOG_ITEM=?",MED,product);
        var next=revisions.submit(MED,submit());
        jdbc.update("update RHN_BD_CATALOG_ITEM set REVISION=REVISION+1 where ID_CATALOG_ITEM=?",product);
        context(TENANT_ID,8L,true);
        assertThatThrownBy(()->revisions.review(MED,review(next.latest().id(),"APPLY"))).hasMessageContaining("影响清单已变化");
        assertThat(revisions.preview(MED,0).latest().proposal().impact()).isEqualTo(next.latest().proposal().impact());
    }
    @Test void legacy_or_corrupt_impact_cannot_be_applied_but_can_be_rejected_without_rewriting_history() {
        var pending=revisions.submit(MED,submit());var stored=history.latest(TENANT_ID,"STANDARD_REVISION",MED.toString()).orElseThrow();
        var legacy=(tools.jackson.databind.node.ObjectNode)codec.readTree(stored.snapshot());
        ((tools.jackson.databind.node.ObjectNode)legacy.path("proposal")).remove("impact");
        jdbc.update("update RHN_BD_CLIN_SEM_VER set JSON_SNAPSHOT=? where ID_CLIN_SEM_VER=?",codec.write(legacy),stored.revision());
        context(TENANT_ID,8L,true);
        Long firstEvent=pending.latest().id();
        assertThat(revisions.preview(MED,0).allowedActions()).containsExactly("REJECT");
        assertThatThrownBy(()->revisions.review(MED,review(firstEvent,"APPLY"))).hasMessageContaining("没有有效的冻结影响清单");
        revisions.review(MED,review(pending.latest().id(),"REJECT"));
        assertThat(jdbc.queryForObject("select JSON_SNAPSHOT from RHN_BD_CLIN_SEM_VER where ID_CLIN_SEM_VER=?",String.class,stored.revision())).isEqualTo(codec.write(legacy));
        context(TENANT_ID,7L,true);pending=revisions.submit(MED,submit());stored=history.latest(TENANT_ID,"STANDARD_REVISION",MED.toString()).orElseThrow();
        var corrupt=(tools.jackson.databind.node.ObjectNode)codec.readTree(stored.snapshot());
        ((tools.jackson.databind.node.ObjectNode)corrupt.at("/proposal/impact")).put("fingerprint","tampered");
        jdbc.update("update RHN_BD_CLIN_SEM_VER set JSON_SNAPSHOT=? where ID_CLIN_SEM_VER=?",codec.write(corrupt),stored.revision());
        context(TENANT_ID,8L,true);assertThat(revisions.preview(MED,0).allowedActions()).containsExactly("REJECT");
    }
    @Test void concurrent_reviews_apply_only_once_and_history_is_paginated() throws Exception {
        var first=revisions.submit(MED,submit());context(TENANT_ID,8L,true);var go=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(2)) {
            Callable<String> apply=()->{go.await();try{return revisions.review(MED,review(first.latest().id(),"APPLY")).latest().status();}catch(BusinessException e){return e.code();}};
            var a=pool.submit(apply);var b=pool.submit(apply);go.countDown();assertThat(List.of(a.get(20,TimeUnit.SECONDS),b.get(20,TimeUnit.SECONDS))).containsExactlyInAnyOrder("APPLIED","STANDARD_REVISION_STALE");
        }
        assertThat(revisions.preview(MED,0).totalEvents()).isEqualTo(2);assertThat(revisions.preview(MED,1).history()).isEmpty();
        assertThat(revisions.preview(MED,0).currentLinks()).hasSize(1);
    }
}
