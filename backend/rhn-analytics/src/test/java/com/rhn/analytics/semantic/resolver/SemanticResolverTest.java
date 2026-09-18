package com.rhn.analytics.semantic.resolver;

import com.rhn.analytics.semantic.model.*;
import com.rhn.analytics.semantic.registry.OutpatientSemanticCatalogProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class SemanticResolverTest {

    private SemanticResolver resolver;

    @BeforeEach
    void setUp() {
        OutpatientSemanticCatalogProvider provider = new OutpatientSemanticCatalogProvider();
        resolver = new SemanticResolver(provider);
    }

    @Test
    @DisplayName("典型案例 Case 1：‘本月各科室药品费用’ -> READY，精准对齐 CHARGE_DEPARTMENT 与 MONTH_TO_DATE")
    void case1_drug_charge_by_department_is_ready() {
        SemanticQuery query = new SemanticQuery(
            AnalysisIntent.METRIC_SUMMARY,
            List.of(new MetricIntent("药品费用")),
            List.of(new DimensionIntent("科室")),
            List.of(),
            TimeIntent.monthToDate(),
            ScopeIntent.AUTHORIZED,
            null,
            null
        );

        Resolution resolution = resolver.resolve(query);

        assertEquals(ResolutionStatus.READY, resolution.status());
        assertNotNull(resolution.query());

        // 验证指标解析
        assertEquals(1, resolution.query().metrics().size());
        ResolvedMetric rm = resolution.query().metrics().get(0);
        assertEquals("OP_DRUG_CHARGE_AMOUNT", rm.definition().code());
        assertEquals(Aggregate.SUM, rm.definition().aggregate());
        assertEquals("CHARGE", rm.definition().source());

        // 验证维度智能消歧：药品费用来自 CHARGE 表，科室自动消歧为 CHARGE_DEPARTMENT
        assertEquals(1, resolution.query().dimensions().size());
        ResolvedDimension rd = resolution.query().dimensions().get(0);
        assertEquals("CHARGE_DEPARTMENT", rd.definition().code());
        assertEquals("CHARGE_DEPARTMENT", rd.semanticRole());

        // 验证时间与范围
        assertEquals("MONTH_TO_DATE", resolution.query().period().type());
        assertEquals(ScopeIntent.AUTHORIZED, resolution.query().scope());
    }

    @Test
    @DisplayName("典型案例 Case 2：‘本月门诊收入’ -> CLARIFY，拒绝猜测，返回结构化口径选项")
    void case2_outpatient_revenue_must_clarify() {
        SemanticQuery query = new SemanticQuery(
            AnalysisIntent.METRIC_SUMMARY,
            List.of(new MetricIntent("门诊收入")),
            List.of(),
            List.of(),
            TimeIntent.monthToDate(),
            ScopeIntent.CURRENT,
            null,
            null
        );

        Resolution resolution = resolver.resolve(query);

        assertEquals(ResolutionStatus.CLARIFY, resolution.status());
        assertNull(resolution.query());
        assertNotNull(resolution.clarification());
        assertEquals("REVENUE_CONCEPT_AMBIGUOUS", resolution.clarification().code());
        assertTrue(resolution.clarification().options().size() >= 2);
        assertTrue(resolution.clarification().options().stream()
            .anyMatch(o -> o.code().equals("OP_CHARGE_NET_AMOUNT")));
    }

    @Test
    @DisplayName("典型案例 Case 3：‘高血压患者用了哪些药’ -> UNSUPPORTED，识别跨实体多对多扇出放大风险")
    void case3_hypertension_patient_drugs_fanout_risk_must_be_unsupported() {
        SemanticQuery query = new SemanticQuery(
            AnalysisIntent.METRIC_SUMMARY,
            List.of(new MetricIntent("开立药品")),
            List.of(new DimensionIntent("高血压")),
            List.of(),
            TimeIntent.monthToDate(),
            ScopeIntent.CURRENT,
            null,
            null
        );

        Resolution resolution = resolver.resolve(query);

        assertEquals(ResolutionStatus.UNSUPPORTED, resolution.status());
        assertEquals("CROSS_ENTITY_JOIN_FANOUT_RISK", resolution.unsupportedReason());
        assertTrue(resolution.message().contains("扇出放大风险"));
    }

    @Test
    @DisplayName("细分科室消歧矩阵：根据指标实体来源准确映射就诊科室、开立科室、记账科室")
    void department_dimension_disambiguation_matrix() {
        // 1. 医嘱数 -> ORDER_DEPARTMENT
        SemanticQuery orderQuery = new SemanticQuery(
            AnalysisIntent.METRIC_SUMMARY,
            List.of(new MetricIntent("有效医嘱数")),
            List.of(new DimensionIntent("科室")),
            List.of(), TimeIntent.monthToDate(), ScopeIntent.AUTHORIZED, null, null
        );
        assertEquals("ORDER_DEPARTMENT", resolver.resolve(orderQuery).query().dimensions().get(0).definition().code());

        // 2. 挂号人次 -> ENCOUNTER_DEPARTMENT
        SemanticQuery regQuery = new SemanticQuery(
            AnalysisIntent.METRIC_SUMMARY,
            List.of(new MetricIntent("门诊挂号人次")),
            List.of(new DimensionIntent("科室")),
            List.of(), TimeIntent.monthToDate(), ScopeIntent.AUTHORIZED, null, null
        );
        assertEquals("ENCOUNTER_DEPARTMENT", resolver.resolve(regQuery).query().dimensions().get(0).definition().code());

        // 3. 服务费用 -> CHARGE_DEPARTMENT
        SemanticQuery serviceQuery = new SemanticQuery(
            AnalysisIntent.METRIC_SUMMARY,
            List.of(new MetricIntent("服务费用")),
            List.of(new DimensionIntent("科室")),
            List.of(), TimeIntent.monthToDate(), ScopeIntent.AUTHORIZED, null, null
        );
        assertEquals("CHARGE_DEPARTMENT", resolver.resolve(serviceQuery).query().dimensions().get(0).definition().code());
    }

    @Test
    @DisplayName("高频业务歧义场景全部拦截并输出结构化澄清选项")
    void all_ambiguity_scenarios_produce_structured_clarification() {
        for (String ambiguousText : List.of("患者数量", "看病人数", "收费情况", "诊断数量", "退号情况", "科室医嘱量")) {
            SemanticQuery query = new SemanticQuery(
                AnalysisIntent.METRIC_SUMMARY,
                List.of(new MetricIntent(ambiguousText)),
                List.of(), List.of(), TimeIntent.monthToDate(), ScopeIntent.CURRENT, null, null
            );
            Resolution res = resolver.resolve(query);
            assertEquals(ResolutionStatus.CLARIFY, res.status(), "对于歧义词【" + ambiguousText + "】必须返回 CLARIFY");
            assertNotNull(res.clarification());
            assertFalse(res.clarification().options().isEmpty(), "必须提供结构化澄清选项");
        }
    }

    @Test
    @DisplayName("不支持场景（财务到账、现金流水、药占比、次均、医生维度、住院域）刚性拦截")
    void unsupported_scenarios_are_strictly_rejected() {
        List<String> unsupportedQueries = List.of(
            "本月医保基金到账金额",
            "本月实收挂号费现金",
            "本月各科室门诊药占比",
            "本月门诊次均药品费用",
            "门诊各医生处方量排行",
            "住院患者次均住院天数",
            "本月门诊患者年龄与性别分布"
        );

        for (String text : unsupportedQueries) {
            SemanticQuery query = new SemanticQuery(
                AnalysisIntent.METRIC_SUMMARY,
                List.of(new MetricIntent(text)),
                List.of(), List.of(), TimeIntent.monthToDate(), ScopeIntent.CURRENT, null, null
            );
            Resolution res = resolver.resolve(query);
            assertEquals(ResolutionStatus.UNSUPPORTED, res.status(), "对于不支持场景【" + text + "】必须返回 UNSUPPORTED");
            assertNotNull(res.unsupportedReason());
        }
    }

    @Test
    @DisplayName("用户实测场景：‘本月各科室药品费用，只显示诊疗科室’ -> READY 并准确生成 dept_type=CLINICAL 过滤条件")
    void user_scenario_drug_charge_filter_clinical_department() {
        SemanticQuery query = new SemanticQuery(
            AnalysisIntent.METRIC_SUMMARY,
            List.of(new MetricIntent("药品费用")),
            List.of(new DimensionIntent("科室")),
            List.of(new FilterIntent("科室", "EQ", List.of("诊疗科室"))),
            TimeIntent.monthToDate(),
            ScopeIntent.AUTHORIZED,
            null,
            null
        );

        Resolution res = resolver.resolve(query);

        assertEquals(ResolutionStatus.READY, res.status(), "该场景应成功解析为 READY");
        assertNotNull(res.query());
        assertEquals("OP_DRUG_CHARGE_AMOUNT", res.query().metrics().get(0).definition().code());
        assertEquals("CHARGE_DEPARTMENT", res.query().dimensions().get(0).definition().code());

        // 验证解析出 ResolvedFilter
        assertFalse(res.query().resolvedFilters().isEmpty(), "必须生成结构化 ResolvedFilter");
        ResolvedFilter rf = res.query().resolvedFilters().get(0);
        assertEquals("CHARGE_DEPARTMENT", rf.dimension().code());
        assertNotNull(rf.attribute());
        assertEquals("dept_type", rf.attribute().code());
        assertEquals(Operator.EQ, rf.operator());
        assertEquals(List.of("CLINICAL"), rf.values());
        assertTrue(res.message().contains("限定收费科室为诊疗科室"));
    }

    @Test
    @DisplayName("用户实测场景：‘本月各诊疗科室药品费用’ -> 识别‘诊疗科室’为科室维度并自动附加临床属性过滤")
    void user_scenario_drug_charge_by_clinical_department_dimension() {
        SemanticQuery query = new SemanticQuery(
            AnalysisIntent.METRIC_SUMMARY,
            List.of(new MetricIntent("药品费用")),
            List.of(new DimensionIntent("诊疗科室")),
            List.of(),
            TimeIntent.monthToDate(),
            ScopeIntent.AUTHORIZED,
            null,
            null
        );

        Resolution res = resolver.resolve(query);

        assertEquals(ResolutionStatus.READY, res.status());
        assertNotNull(res.query());
        assertEquals("OP_DRUG_CHARGE_AMOUNT", res.query().metrics().get(0).definition().code());
        assertEquals("CHARGE_DEPARTMENT", res.query().dimensions().get(0).definition().code());

        // 验证自动隐式附带了临床科室属性过滤
        assertFalse(res.query().resolvedFilters().isEmpty());
        ResolvedFilter rf = res.query().resolvedFilters().get(0);
        assertEquals("dept_type", rf.attribute().code());
        assertEquals(List.of("CLINICAL"), rf.values());
    }
}
