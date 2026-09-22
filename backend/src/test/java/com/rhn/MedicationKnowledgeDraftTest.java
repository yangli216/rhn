package com.rhn;

import com.rhn.quality.medication.api.MedicationKnowledgeDraftContracts.*;
import com.rhn.quality.medication.application.MedicationKnowledgeDraftService;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.json.JsonCodec;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.http.MediaType;
import java.util.*;
import java.util.concurrent.*;
import static org.mockito.Mockito.when;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ResetDatabaseBeforeEachTestMethod
class MedicationKnowledgeDraftTest extends RhnIntegrationTestSupport {
    @Autowired MedicationKnowledgeDraftService drafts;
    @Autowired JsonCodec codec;
    @Autowired com.rhn.platform.masterdata.api.StandardMedicationReferenceDirectory standards;
    @MockitoBean ExecutionContextProvider contexts;
    @MockitoBean com.rhn.platform.masterdata.application.MedicationRouteService routes;
    static final String PATH="/api/quality/medication-knowledge-drafts";
    @BeforeEach void context() {context(Long.valueOf(TENANT),true);}
    void context(Long tenant,boolean manage) {when(contexts.requireCurrent()).thenReturn(new ExecutionContext(tenant,7L,"draft-author","knowledge-test",manage?Set.of("MASTER_DATA.MANAGE"):Set.of(),Long.valueOf(ORGANIZATION),Long.valueOf(DEPARTMENT),"DEPARTMENT",Set.of(),Set.of()));}
    @Test void immutable_versions_preserve_original_evidence_and_cannot_publish() throws Exception {
        var first=drafts.save(null,new Save(0,MedicationKnowledgeDraftModelTest.duplicate(),"建立合成模型"));
        assertThat(first.saved().status()).isEqualTo("DRAFT"); assertThat(first.cases()).allMatch(TestCase::passed);
        var next=drafts.save(first.saved().id(),new Save(1,MedicationKnowledgeDraftModelTest.conditions(first.saved().body(),new Conditions("ALL",null,null,null,MedicationKnowledgeDraftModelTest.ALL,MedicationKnowledgeDraftModelTest.ALL,"尚未结构化条件")),"补充待处理条件"));
        assertThat(next.saved().version()).isEqualTo(2);assertThat(next.currentAssessment().structureComplete()).isFalse();assertThat(next.cases()).isEmpty();
        assertThat(drafts.history(first.saved().id(),0)).extracting(Version::version).containsExactly(2,1);
        assertThat(drafts.history(first.saved().id(),0).get(1)).isEqualTo(first.saved());
        assertThatThrownBy(()->drafts.save(first.saved().id(),new Save(1,first.saved().body(),"过期修改"))).hasMessageContaining("版本已变化");
        mockMvc.perform(get(PATH+"/"+first.saved().id()).with(rhnWorkContext())).andExpect(status().isOk()).andExpect(jsonPath("$.saved.status").value("DRAFT"));
    }
    @Test void incomplete_drafts_can_be_saved_and_api_reports_gaps() throws Exception {
        var body=new Body("未完成相互作用知识","DRUG_INTERACTION","GROUP_PAIR",List.of(),List.of(),null,"SAME_PRESCRIPTION",null,null,null,null,null);
        mockMvc.perform(post(PATH).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(codec.write(new Save(0,body,"先保留原始线索"))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.currentAssessment.structureComplete").value(false)).andExpect(jsonPath("$.cases.length()").value(0));
        assertThat(drafts.list("相互作用",0,20).totalElements()).isEqualTo(1);
        assertThatThrownBy(()->drafts.save(null,new Save(1,body,"原因"))).hasMessageContaining("版本已变化");
        assertThatThrownBy(()->drafts.history(1L,-1)).hasMessageContaining("分页参数");
    }
    @Test void tenant_and_permission_boundaries_apply_to_all_operations() {
        var saved=drafts.save(null,new Save(0,MedicationKnowledgeDraftModelTest.duplicate(),"test"));
        context(9999L,true);assertThat(drafts.list("",0,20).content()).isEmpty();
        assertThatThrownBy(()->drafts.detail(saved.saved().id())).hasMessageContaining("当前租户");
        assertThatThrownBy(()->drafts.save(saved.saved().id(),new Save(1,saved.saved().body(),"test"))).hasMessageContaining("当前租户");
        context(Long.valueOf(TENANT),false);
        assertThatThrownBy(()->drafts.list("",0,20)).hasMessageContaining("权限");
        assertThatThrownBy(()->drafts.validate(saved.saved().body())).hasMessageContaining("权限");
        assertThatThrownBy(()->drafts.save(null,new Save(0,saved.saved().body(),"test"))).hasMessageContaining("权限");
    }
    @Test void drafts_pin_authoritative_reference_identity_without_requiring_local_medication_adoption() {
        var reference = standards.requireSpecification("STD-9405B86DD5B404C44E1B92B5");
        assertThat(reference.entryId()).isNotBlank(); assertThat(reference.name()).isEqualTo("阿莫西林"); assertThat(reference.preparationSpec()).isEqualTo("0.25g");
        var b = MedicationKnowledgeDraftModelTest.duplicate();
        var target = new Target("SPECIFICATION", reference.specificationId(), reference.catalogId(), reference.catalogVersion(), reference.contentHash());
        var body = new Body(b.title(), b.kind(), "EXPLICIT_GROUP", List.of(target), List.of(), 2, b.exposureScope(), b.conditions(), b.evidence(), b.clinicalMeaning(), b.severity(), b.proposedAction());
        var saved = drafts.save(null, new Save(0, body, "合成模型测试，不构成临床知识"));
        assertThat(saved.currentAssessment().groupA().getFirst().reference()).isEqualTo(reference);
        assertThat(saved.currentAssessment().structureComplete()).isTrue();
        var stale = new Target("SPECIFICATION", reference.specificationId(), reference.catalogId(), "OLD", reference.contentHash());
        var staleBody = new Body(b.title(), b.kind(), "EXPLICIT_GROUP", List.of(stale), List.of(), 2, b.exposureScope(), b.conditions(), b.evidence(), b.clinicalMeaning(), b.severity(), b.proposedAction());
        assertThat(drafts.validate(staleBody).issues()).extracting(Issue::code).contains("STALE_STANDARD");
    }
    @Test void route_definition_changes_invalidate_current_assessment_without_rewriting_history() {
        var first = new com.rhn.platform.masterdata.api.MedicationRouteDirectory.RouteSnapshot(1L,"PO","测试口服","ROUTES","1","NONE");
        when(routes.resolveActive(org.mockito.ArgumentMatchers.any(),org.mockito.ArgumentMatchers.eq("PO"),org.mockito.ArgumentMatchers.any(),org.mockito.ArgumentMatchers.any())).thenReturn(Optional.of(first));
        var b = MedicationKnowledgeDraftModelTest.conditions(MedicationKnowledgeDraftModelTest.duplicate(),new Conditions("ALL",null,null,null,new RouteCondition("LIST",List.of("PO")),MedicationKnowledgeDraftModelTest.ALL,""));
        var saved = drafts.save(null,new Save(0,b,"锁定途径版本"));
        assertThat(saved.currentAssessment().structureComplete()).isTrue();
        var next = new com.rhn.platform.masterdata.api.MedicationRouteDirectory.RouteSnapshot(1L,"PO","测试口服修订","ROUTES","2","NONE");
        when(routes.resolveActive(org.mockito.ArgumentMatchers.any(),org.mockito.ArgumentMatchers.eq("PO"),org.mockito.ArgumentMatchers.any(),org.mockito.ArgumentMatchers.any())).thenReturn(Optional.of(next));
        var refreshed = drafts.detail(saved.saved().id());
        assertThat(refreshed.currentAssessment().issues()).extracting(Issue::code).contains("STALE_ROUTE");
        assertThat(refreshed.cases()).isEmpty();
        assertThat(drafts.list("",0,20).content().getFirst().structureComplete()).isFalse();
        assertThat(drafts.history(saved.saved().id(),0).getFirst().assessment().groupARoutes()).containsExactly(first);
        var revised = drafts.save(saved.saved().id(),new Save(1,b,"已核对当前途径修订，保存新草稿"));
        assertThat(revised.currentAssessment().groupARoutes()).containsExactly(next);
        assertThat(revised.currentAssessment().structureComplete()).isTrue();
    }
    @Test void concurrent_edits_append_exactly_one_next_version() throws Exception {
        var saved=drafts.save(null,new Save(0,MedicationKnowledgeDraftModelTest.duplicate(),"test"));
        var gate=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(2)) {
            Callable<String> action=()-> {gate.await();try {drafts.save(saved.saved().id(),new Save(1,saved.saved().body(),"并发修改"));return "SAVED";}catch(BusinessException ex){return ex.code();}};
            var a=pool.submit(action);var b=pool.submit(action);gate.countDown();
            assertThat(List.of(a.get(20,TimeUnit.SECONDS),b.get(20,TimeUnit.SECONDS))).containsExactlyInAnyOrder("SAVED","QMED_KNOWLEDGE_STALE");
        }
        assertThat(drafts.history(saved.saved().id(),0)).hasSize(2);
    }
}
