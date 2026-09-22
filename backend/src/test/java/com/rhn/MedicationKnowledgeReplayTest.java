package com.rhn;

import com.rhn.outpatient.api.*;
import com.rhn.platform.masterdata.api.MedicationRouteDirectory.RouteSnapshot;
import com.rhn.platform.masterdata.api.StandardMedicationReferenceDirectory.Reference;
import com.rhn.quality.medication.api.MedicationKnowledgeDraftContracts.*;
import com.rhn.quality.medication.api.MedicationKnowledgeReplayContracts.Request;
import com.rhn.quality.medication.application.*;
import com.rhn.quality.medication.domain.MedicationSafetyEvaluation;
import com.rhn.quality.medication.infrastructure.*;
import com.rhn.shared.context.*;
import com.rhn.shared.id.GlobalIds;
import com.rhn.shared.json.JsonCodec;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.http.MediaType;
import java.time.*;
import java.util.*;
import static org.mockito.Mockito.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ResetDatabaseBeforeEachTestMethod
class MedicationKnowledgeReplayTest extends RhnIntegrationTestSupport {
    @Autowired MedicationKnowledgeReplayService replay;
    @Autowired MedicationKnowledgeDraftService drafts;
    @Autowired MedicationKnowledgeDraftStore draftStore;
    @Autowired MedicationEvaluationStore evaluations;
    @Autowired JsonCodec json;
    @Autowired JdbcTemplate jdbc;
    @MockitoBean ExecutionContextProvider contexts;
    @MockitoBean com.rhn.quality.medication.api.MedicationRuleAuthoringAi ai;
    static final Long T=Long.valueOf(TENANT),O=Long.valueOf(ORGANIZATION),D=Long.valueOf(DEPARTMENT);
    static final String PATH="/api/quality/medication-knowledge-drafts";
    static final LocalDate DATE=LocalDate.of(2026,1,10);
    @BeforeEach void setup() {context(T,O,D,true);}
    void context(Long tenant,Long org,Long dept,boolean manage) {when(contexts.requireCurrent()).thenReturn(new ExecutionContext(tenant,7L,"回放人员","test",manage?Set.of("MASTER_DATA.MANAGE"):Set.of(),org,dept,"DEPARTMENT",Set.of(),Set.of()));}
    Version duplicate() {return drafts.save(null,new Save(0,MedicationKnowledgeDraftModelTest.duplicate(),"合成测试，非临床知识")).saved();}
    PrescriptionSafetySnapshot.MedicationItem row(long id,String entry,String spec,String status,String routeVersion) {
        var ref=Map.of("status","LINKED","catalogId","C","catalogVersion","1","contentHash","a".repeat(64),"entryId",entry,"specificationId",spec);
        var route=Map.of("conceptId",10L,"code","PO","system","R","systemVersion",routeVersion);
        var sem=Map.of("schemaVersion","qmed-medication-semantics-v1","medicationId",100L,"status","VERSIONED_PARTIAL","medicationSemanticVersion","b".repeat(64),"standardReference",ref,"route",route);
        String frozen=json.write(Map.of("id",100L,"name","冻结测试药品","clinicalSemantics",sem));
        return new PrescriptionSafetySnapshot.MedicationItem(id,1,100L,null,null,status,"VERSIONED_PARTIAL",null,null,10L,"PO","NONE","RESOLVED",null,null,null,null,null,frozen,null,null);
    }
    PrescriptionSafetySnapshot snapshot(List<PrescriptionSafetySnapshot.MedicationItem> rows,Integer age,boolean timing) {
        return new PrescriptionSafetySnapshot(PrescriptionSafetySnapshot.SCHEMA_VERSION,T,1000L,2,2000L,3000L,O,D,"ACTIVE",rows,
                new PrescriptionSafetySnapshot.PatientSafetyContext(true,true,null,List.of(),age,"UNKNOWN"),timing?new PrescriptionSafetySnapshot.EvaluationTiming(DATE,"Asia/Shanghai"):null);
    }
    Long source(PrescriptionSafetySnapshot snapshot) {
        Long id=GlobalIds.next();String hash=PrescriptionSafetyHasher.hash(snapshot,json);var now=Instant.now();
        var decision=new MedicationSafetyDecision(id,snapshot.prescriptionId(),snapshot.prescriptionRevision(),hash,"synthetic","test","SHADOW",MedicationSafetyDecision.Status.WARN,List.of(),List.of(),List.of());
        evaluations.append(new MedicationSafetyEvaluation(id,7L,snapshot,hash,now,now,decision,List.of()));return id;
    }
    int count(String table) {return jdbc.queryForObject("select count(*) from "+table,Integer.class);}
    @Test void replay_freezes_exact_knowledge_and_historical_facts_is_durable_and_never_executes_ai_or_publishes() throws Exception {
        var k=duplicate();Long evaluation=source(snapshot(List.of(row(1,"E","S1","DRAFT","1"),row(2,"E","S2","ACTIVE","1")),33,true));
        var before=jdbc.queryForList("select * from RHN_AUD_MED_EVAL");int clinical=count("RHN_EX_MED_REQ"),governance=count("RHN_AUD_MED_GOV");
        var run=replay.replay(k.id(),new Request(1,evaluation));
        assertThat(run.result().outcome()).isEqualTo("MATCH");assertThat(run.result().matchedOrderIds()).containsExactly("1","2");
        assertThat(run.input().facts().age()).isEqualTo(33);assertThat(run.input().facts().date()).isEqualTo(DATE);
        assertThat(run.input().items().getFirst().originalStatus()).isEqualTo("DRAFT");assertThat(run.input().items().getFirst().fact().status()).isEqualTo("ACTIVE");
        assertThat(run.knowledge()).isEqualTo(k);assertThat(run.knowledgeHash()).isEqualTo(MedicationKnowledgeReplayService.hash(json.write(k)));
        assertThat(run.inputHash()).isEqualTo(MedicationKnowledgeReplayService.hash(json.write(run.input())));
        assertThat(replay.detail(k.id(),run.id())).isEqualTo(run);
        assertThat(replay.history(k.id(),0).content()).singleElement().satisfies(s->assertThat(s.outcome()).isEqualTo("MATCH"));
        assertThat(jdbc.queryForList("select * from RHN_AUD_MED_EVAL")).isEqualTo(before);
        assertThat(count("RHN_EX_MED_REQ")).isEqualTo(clinical);assertThat(count("RHN_AUD_MED_GOV")).isEqualTo(governance);verifyNoInteractions(ai);
        mockMvc.perform(get(PATH+"/"+k.id()+"/replays/"+run.id()).with(rhnWorkContext())).andExpect(status().isOk()).andExpect(jsonPath("$.input.facts.date").value("2026-01-10"));
    }
    Version interaction() {
        var a=new Reference("C","1","a".repeat(64),"source","EA","SA","合成甲","TABLET","合成规格");
        var b=new Reference("C","1","a".repeat(64),"source","EB","SB","合成乙","TABLET","合成规格");
        var conditions=new Conditions("ALL",null,null,null,new RouteCondition("LIST",List.of("PO")),new RouteCondition("LIST",List.of("PO")),"");
        var body=new Body("合成配对","DRUG_INTERACTION","GROUP_PAIR",List.of(new Target("ENTRY","SA","C","1","a".repeat(64))),List.of(new Target("SPECIFICATION","SB","C","1","a".repeat(64))),null,"SAME_PRESCRIPTION",conditions,MedicationKnowledgeDraftModelTest.evidence(),"仅测试配对","HIGH","WARN");
        var route=new RouteSnapshot(10L,"PO","口服","R","1","NONE");
        var k=new Version(GlobalIds.next(),1,"DRAFT",body,new Assessment(true,List.of(),"测试",List.of(new ResolvedTarget("ENTRY",a)),List.of(new ResolvedTarget("SPECIFICATION",b)),List.of(route),List.of(route)),7L,"作者",Instant.now(),"合成历史知识");
        draftStore.append(T,k);return k;
    }
    @Test void interactions_use_frozen_groups_and_route_identity_versions_without_replacing_them_with_current_standards() {
        var k=interaction();
        var matched=replay.replay(k.id(),new Request(1,source(snapshot(List.of(row(1,"EB","SB","ACTIVE","1"),row(2,"EA","OTHER-A-SPEC","ACTIVE","1")),30,true))));
        assertThat(matched.result().outcome()).isEqualTo("MATCH");assertThat(matched.result().matchedOrderIds()).containsExactly("2","1");
        assertThat(matched.currentKnowledgeIssues()).isNotEmpty(); // Frozen identities no longer available in today's catalogue.
        assertThat(matched.knowledge().assessment().groupA().getFirst().reference().entryId()).isEqualTo("EA");
        var drift=replay.replay(k.id(),new Request(1,source(snapshot(List.of(row(1,"EA","SA","ACTIVE","1"),row(2,"EB","SB","ACTIVE","2")),30,true))));
        assertThat(drift.result().outcome()).isEqualTo("UNAVAILABLE");assertThat(drift.result().reasons()).anyMatch(r->r.contains("途径来源版本不一致"));
        var wrongSpec=replay.replay(k.id(),new Request(1,source(snapshot(List.of(row(1,"EA","SA","ACTIVE","1"),row(2,"EB","OTHER-B","ACTIVE","1")),30,true))));
        assertThat(wrongSpec.result().outcome()).isEqualTo("NO_MATCH");
    }
    @Test void missing_semantics_unsupported_states_and_mixed_editions_are_unavailable_while_cancelled_items_are_excluded() {
        var k=duplicate();var good=row(1,"E","S","ACTIVE","1");var broken=new PrescriptionSafetySnapshot.MedicationItem(2L,0,100L,null,null,"ACTIVE","LEGACY",null,null,null,null,null,"UNMAPPED",null,null,null,null,null,"{}",null,null);
        var bad=replay.replay(k.id(),new Request(1,source(snapshot(List.of(good,broken),30,true))));
        assertThat(bad.result().outcome()).isEqualTo("UNAVAILABLE");assertThat(bad.input().items().get(1).gaps()).isNotEmpty();
        assertThat(replay.replay(k.id(),new Request(1,source(snapshot(List.of(good,row(2,"E","S","CANCELLED","1")),30,true)))).result().outcome()).isEqualTo("NO_MATCH");
        assertThat(replay.replay(k.id(),new Request(1,source(snapshot(List.of(good,row(2,"E","S","COMPLETED","1")),30,true)))).result().outcome()).isEqualTo("UNAVAILABLE");
        var mixed=row(2,"E","S","ACTIVE","1");var saved=json.readObject(json.write(mixed));saved.put("medicationSnapshot",mixed.medicationSnapshot().replace("\"catalogVersion\":\"1\"","\"catalogVersion\":\"old\""));
        assertThat(replay.replay(k.id(),new Request(1,source(snapshot(List.of(good,json.read(json.write(saved),PrescriptionSafetySnapshot.MedicationItem.class)),30,true)))).result().outcome()).isEqualTo("UNAVAILABLE");
    }
    @Test void date_and_age_are_never_filled_from_today_or_converted_from_years_to_months() {
        var base=MedicationKnowledgeDraftModelTest.duplicate();var evidence=base.evidence();
        var dated=new Body(base.title(),base.kind(),base.matchMode(),base.groupA(),base.groupB(),base.minimumOrders(),base.exposureScope(),base.conditions(),new Evidence(evidence.sourceType(),evidence.title(),evidence.publisher(),evidence.edition(),evidence.locator(),evidence.excerpt(),evidence.documentHash(),DATE.minusDays(1),DATE.plusDays(1)),base.clinicalMeaning(),base.severity(),base.proposedAction());
        var k=drafts.save(null,new Save(0,dated,"日期边界")).saved();var rows=List.of(row(1,"E","S","ACTIVE","1"),row(2,"E","S","ACTIVE","1"));
        assertThat(replay.replay(k.id(),new Request(1,source(snapshot(rows,30,true)))).result().outcome()).isEqualTo("MATCH");
        Long oldSource=source(snapshot(rows,30,false));
        var oldJson=json.readObject(jdbc.queryForObject("select JSON_INPUT from RHN_AUD_MED_EVAL where ID_EVAL=?",String.class,oldSource));
        oldJson.remove("evaluationTiming");String oldRaw=json.write(oldJson);
        jdbc.update("update RHN_AUD_MED_EVAL set JSON_INPUT=?,CD_INPUT_HASH=? where ID_EVAL=?",oldRaw,MedicationKnowledgeReplayService.hash(oldRaw),oldSource);
        var legacy=replay.replay(k.id(),new Request(1,oldSource));assertThat(legacy.input().facts().date()).isNull();assertThat(legacy.result().outcome()).isEqualTo("UNAVAILABLE");
        var monthly=MedicationKnowledgeDraftModelTest.conditions(base,new Conditions("RANGE","MONTH",0,12,MedicationKnowledgeDraftModelTest.ALL,MedicationKnowledgeDraftModelTest.ALL,""));
        var month=drafts.save(null,new Save(0,monthly,"月龄不得由周岁换算")).saved();
        assertThat(replay.replay(month.id(),new Request(1,source(snapshot(rows,0,true)))).result().outcome()).isEqualTo("UNAVAILABLE");
    }
    @Test void stale_knowledge_and_tampered_or_conflicting_source_inputs_cannot_be_replayed() {
        var k=duplicate();Long evaluation=source(snapshot(List.of(row(1,"E","S","ACTIVE","1")),30,true));
        drafts.save(k.id(),new Save(1,k.body(),"新版本"));
        assertThatThrownBy(()->replay.replay(k.id(),new Request(1,evaluation))).hasMessageContaining("版本已变化");
        jdbc.update("update RHN_AUD_MED_EVAL set JSON_INPUT='{}' where ID_EVAL=?",evaluation);
        assertThatThrownBy(()->replay.replay(k.id(),new Request(2,evaluation))).hasMessageContaining("指纹不一致");
        Long inconsistent=source(snapshot(List.of(row(1,"E","S","ACTIVE","1")),30,true));
        jdbc.update("update RHN_AUD_MED_EVAL set NO_TARGET_REV=99 where ID_EVAL=?",inconsistent);
        assertThatThrownBy(()->replay.replay(k.id(),new Request(2,inconsistent))).hasMessageContaining("输入身份");
        assertThat(replay.history(k.id(),0).totalElements()).isZero();
    }
    @Test void sources_history_and_details_are_scoped_and_paged_and_http_requires_authentication() throws Exception {
        var k=duplicate();Long evaluation=source(snapshot(List.of(row(1,"E","S","ACTIVE","1")),30,true));
        var run=replay.replay(k.id(),new Request(1,evaluation));
        for(int i=0;i<20;i++) source(snapshot(List.of(),30,true));
        assertThat(replay.sources(0).totalElements()).isEqualTo(21);assertThat(replay.sources(1).content()).hasSize(1);
        mockMvc.perform(get(PATH+"/replay-sources").with(rhnWorkContext()).param("page","1"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(21)).andExpect(jsonPath("$.content.length()").value(1));
        mockMvc.perform(post(PATH+"/"+k.id()+"/replays").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(json.write(new Request(1,evaluation))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.result.outcome").value("NO_MATCH"));
        context(T,O,9999L,true);assertThat(replay.sources(0).content()).isEmpty();assertThat(replay.history(k.id(),0).content()).isEmpty();
        assertThatThrownBy(()->replay.detail(k.id(),run.id())).hasMessageContaining("当前工作范围");assertThatThrownBy(()->replay.replay(k.id(),new Request(1,evaluation))).hasMessageContaining("当前工作范围");
        context(9999L,O,D,true);assertThat(replay.sources(0).content()).isEmpty();assertThatThrownBy(()->replay.detail(k.id(),run.id())).hasMessageContaining("当前工作范围");
        context(T,9999L,D,true);assertThat(replay.sources(0).content()).isEmpty();assertThatThrownBy(()->replay.detail(k.id(),run.id())).hasMessageContaining("当前工作范围");
        context(T,null,null,true);assertThatThrownBy(()->replay.sources(0)).hasMessageContaining("请选择工作机构");
        context(T,O,D,false);assertThatThrownBy(()->replay.sources(0)).hasMessageContaining("权限");
        context(T,O,D,true);assertThatThrownBy(()->replay.sources(-1)).hasMessageContaining("分页参数");
        mockMvc.perform(get(PATH+"/replay-sources").header("X-Tenant-Id",TENANT)).andExpect(status().isUnauthorized());
    }
}
