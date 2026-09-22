package com.rhn;

import com.rhn.platform.masterdata.api.MedicationRouteDirectory;
import com.rhn.platform.masterdata.api.StandardMedicationReferenceDirectory;
import com.rhn.platform.masterdata.api.StandardMedicationReferenceDirectory.Reference;
import com.rhn.quality.medication.api.MedicationKnowledgeDraftContracts.*;
import com.rhn.quality.medication.application.MedicationKnowledgeDraftValidator;
import com.rhn.quality.medication.application.MedicationKnowledgeDraftPreview;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import java.time.LocalDate;
import java.util.*;
import static org.mockito.Mockito.*;
import static org.assertj.core.api.Assertions.*;

class MedicationKnowledgeDraftModelTest {
    StandardMedicationReferenceDirectory standards = mock(StandardMedicationReferenceDirectory.class);
    MedicationRouteDirectory routes = mock(MedicationRouteDirectory.class);
    MedicationKnowledgeDraftValidator validator = new MedicationKnowledgeDraftValidator(standards, routes);
    static final RouteCondition ALL = new RouteCondition("ALL", List.of());
    static final Conditions CONDITIONS = new Conditions("ALL", null, null, null, ALL, ALL, "");
    @BeforeEach void references() {
        when(standards.requireSpecification("S1")).thenReturn(new Reference("C", "V1", "hash", "source", "E1", "S1", "合成甲", "TABLET", "合成规格甲"));
        when(standards.requireSpecification("S2")).thenReturn(new Reference("C", "V1", "hash", "source", "E2", "S2", "合成乙", "TABLET", "合成规格乙"));
        when(standards.requireSpecification("S3")).thenReturn(new Reference("C", "V1", "hash", "source", "E1", "S3", "合成甲另一规格", "TABLET", "合成规格丙"));
        when(routes.resolveActive(any(), eq("PO"), any(), any())).thenReturn(Optional.of(new MedicationRouteDirectory.RouteSnapshot(1L,"PO","口服","R","1","NONE")));
        when(routes.resolveActive(any(), eq("IV"), any(), any())).thenReturn(Optional.of(new MedicationRouteDirectory.RouteSnapshot(2L,"IV","静脉","R","1","INFUSION")));
    }
    static Evidence evidence() {return new Evidence("INSTITUTION_POLICY", "合成测试材料，非临床依据", "测试机构", "1", "测试第1页", "仅验证匹配模型，不能用于临床", "a".repeat(64), null, null);}
    static Body duplicate() {return new Body("合成重复模型", "DUPLICATE_THERAPY", "SAME_STANDARD_ENTRY", List.of(), List.of(), 2, "SAME_PRESCRIPTION", CONDITIONS, evidence(), "仅测试重复标准条目", "MEDIUM", "WARN");}
    static Target target(String level, String spec) {return new Target(level, spec, "C", "V1", "hash");}
    static Body interaction() {return new Body("合成相互作用模型", "DRUG_INTERACTION", "GROUP_PAIR", List.of(target("ENTRY","S1")), List.of(target("SPECIFICATION","S2")), null, "SAME_PRESCRIPTION", CONDITIONS, evidence(), "仅测试两组配对，不构成药学知识", "HIGH", "REQUIRE_OVERRIDE");}
    static Body conditions(Body b, Conditions c) {return new Body(b.title(),b.kind(),b.matchMode(),b.groupA(),b.groupB(),b.minimumOrders(),b.exposureScope(),c,b.evidence(),b.clinicalMeaning(),b.severity(),b.proposedAction());}
    static Row row(String order, String entry, String spec, String route) {return new Row(order,"C","V1","hash",entry,spec,route,"ACTIVE");}
    Result run(Body body, Row... rows) {return MedicationKnowledgeDraftPreview.evaluate(body, validator.assess(1L, body),new Facts(30,"YEAR",LocalDate.of(2026,1,1),List.of(rows)));}
    @Test void same_entry_is_not_same_name_or_same_spec_and_orders_are_distinct() {
        var b=duplicate();var r=row("1","E1","S1","PO");
        assertThat(run(b,r,row("2","E1","S3","PO")).outcome()).isEqualTo("MATCH");
        assertThat(run(b,r,row("2","E2","S2","PO")).outcome()).isEqualTo("NO_MATCH");
        assertThat(run(b,r,r).outcome()).isEqualTo("NO_MATCH");
        assertThat(run(b,r,row("1","E2","S2","PO")).outcome()).isEqualTo("UNAVAILABLE");
    }
    @Test void reports_all_participating_orders_across_duplicate_groups_and_interaction_pairs() {
        var duplicate=run(duplicate(),row("1","E1","S1","PO"),row("2","E1","S3","PO"),row("3","E2","S2","PO"),row("4","E2","S2","PO"));
        assertThat(duplicate.matchedOrderIds()).containsExactly("1","2","3","4");
        var interaction=run(interaction(),row("1","E1","S1","PO"),row("2","E1","S3","PO"),row("3","E2","S2","PO"),row("4","E2","S2","PO"));
        assertThat(interaction.matchedOrderIds()).containsExactlyInAnyOrder("1","2","3","4");
    }
    @Test void interaction_respects_group_level_routes_and_order_independence() {
        var b=conditions(interaction(),new Conditions("ALL",null,null,null,new RouteCondition("LIST",List.of("PO")),new RouteCondition("LIST",List.of("IV")),""));
        Row a=row("1","E1","S3","PO"), bRow=row("2","E2","S2","IV");
        assertThat(run(b,a,bRow).outcome()).isEqualTo("MATCH");
        assertThat(run(b,bRow,a).outcome()).isEqualTo("MATCH");
        assertThat(run(b,a,row("2","E2","other-spec","IV")).outcome()).isEqualTo("NO_MATCH");
        assertThat(run(b,a,row("2","E2","S2","PO")).outcome()).isEqualTo("NO_MATCH");
        assertThat(run(b,a,row("2","E2","S2",null)).outcome()).isEqualTo("UNAVAILABLE");
        assertThat(run(b,a).outcome()).isEqualTo("NO_MATCH");
    }
    @Test void missing_data_and_mixed_standard_editions_never_become_no_match() {
        var b=duplicate();var r=row("1","E1","S1","PO");
        assertThat(run(b,r,new Row("2","C","OLD","hash","E1","S1","PO","ACTIVE")).outcome()).isEqualTo("UNAVAILABLE");
        assertThat(run(b,r,new Row("2",null,null,null,null,null,null,"ACTIVE")).outcome()).isEqualTo("UNAVAILABLE");
        assertThat(run(b,r,new Row("2",null,null,null,null,null,null,"STOPPED")).outcome()).isEqualTo("NO_MATCH");
    }
    @Test void age_bounds_are_explicit_and_no_year_to_day_guessing_occurs() {
        var b=conditions(duplicate(),new Conditions("RANGE","MONTH",1,6,ALL,ALL,"")); var a=validator.assess(1L,b);
        var rows=List.of(row("1","E1","S1","PO"),row("2","E1","S1","PO"));
        assertThat(MedicationKnowledgeDraftPreview.evaluate(b,a,new Facts(1,"MONTH",null,rows)).outcome()).isEqualTo("MATCH");
        assertThat(MedicationKnowledgeDraftPreview.evaluate(b,a,new Facts(6,"MONTH",null,rows)).outcome()).isEqualTo("NOT_APPLICABLE");
        assertThat(MedicationKnowledgeDraftPreview.evaluate(b,a,new Facts(1,"YEAR",null,rows)).outcome()).isEqualTo("UNAVAILABLE");
        assertThat(MedicationKnowledgeDraftPreview.evaluate(b,a,new Facts(null,"MONTH",null,rows)).outcome()).isEqualTo("UNAVAILABLE");
    }
    @Test void stale_targets_overlaps_and_unstructured_conditions_block_preview_but_are_explainable() {
        var b=interaction();
        var overlapping=new Body(b.title(),b.kind(),b.matchMode(),b.groupA(),List.of(target("SPECIFICATION","S3")),null,b.exposureScope(),b.conditions(),b.evidence(),b.clinicalMeaning(),b.severity(),b.proposedAction());
        assertThat(validator.assess(1L,overlapping).issues()).extracting(Issue::code).contains("OVERLAPPING_GROUPS");
        var unsupported=conditions(b,new Conditions("ALL",null,null,null,ALL,ALL,"仅肾功能异常患者"));
        assertThat(validator.assess(1L,unsupported).issues()).extracting(Issue::code).contains("UNSTRUCTURED");
        assertThat(run(unsupported).outcome()).isEqualTo("UNAVAILABLE");
        when(standards.requireSpecification("S1")).thenReturn(new Reference("C","V2","new","s","E1","S1","甲","TABLET","x"));
        assertThat(validator.assess(1L,b).issues()).extracting(Issue::code).contains("STALE_STANDARD");
        assertThat(validator.assess(1L,new Body("x",null,null,null,null,null,null,null,null,null,null,null)).structureComplete()).isFalse();
    }
    @Test void source_file_drift_is_visible_even_when_catalogue_content_and_code_are_unchanged() {
        var body = interaction(); var original = validator.assess(1L, body);
        var version = new Version(42L, 1, "DRAFT", body, original, 7L, "作者", java.time.Instant.now(), "合成草稿");
        var store = mock(com.rhn.quality.medication.infrastructure.MedicationKnowledgeDraftStore.class);
        var contexts = mock(com.rhn.shared.context.ExecutionContextProvider.class);
        when(contexts.requireCurrent()).thenReturn(new com.rhn.shared.context.ExecutionContext(1L,7L,"作者","test",Set.of("MASTER_DATA.MANAGE")));
        when(store.latest(1L,42L)).thenReturn(Optional.of(version)); when(store.latest(1L)).thenReturn(List.of(version));
        var service = new com.rhn.quality.medication.application.MedicationKnowledgeDraftService(contexts,store,validator,mock(com.rhn.shared.json.JsonCodec.class),mock(com.rhn.quality.medication.application.MedicationKnowledgeExtractionService.class),mock(com.rhn.quality.medication.application.MedicationRuleIntakeService.class));
        when(standards.requireSpecification("S1")).thenReturn(new Reference("C","V1","hash","new-source","E1","S1","合成甲","TABLET","合成规格甲"));
        var detail = service.detail(42L);
        assertThat(detail.currentAssessment().issues()).extracting(Issue::code).contains("STALE_STANDARD_REFERENCE");
        assertThat(detail.currentAssessment().structureComplete()).isFalse(); assertThat(detail.cases()).isEmpty();
        assertThat(detail.saved().assessment().groupA().getFirst().reference().sourceHash()).isEqualTo("source");
    }
    @Test void generated_cases_test_both_rule_types_and_explicit_group_thresholds() {
        var b=duplicate();
        var explicit=new Body(b.title(),b.kind(),"EXPLICIT_GROUP",List.of(target("ENTRY","S1"),target("ENTRY","S2")),List.of(),3,b.exposureScope(),b.conditions(),b.evidence(),b.clinicalMeaning(),b.severity(),b.proposedAction());
        for(var body:List.of(b,interaction(),explicit,conditions(interaction(),new Conditions("RANGE","YEAR",18,65,ALL,ALL,"")))) {
            var a=validator.assess(1L,body);assertThat(a.issues()).isEmpty();
            assertThat(MedicationKnowledgeDraftPreview.cases(body,a)).hasSizeGreaterThanOrEqualTo(7).allMatch(TestCase::passed);
        }
        assertThat(run(explicit,row("1","E1","S1","PO"),row("2","E2","S2","PO"),row("3","E1","S3","PO")).outcome()).isEqualTo("MATCH");
    }
}
