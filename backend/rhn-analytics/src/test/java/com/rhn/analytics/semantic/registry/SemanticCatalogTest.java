package com.rhn.analytics.semantic.registry;

import com.rhn.analytics.semantic.baseline.SemanticCase;
import com.rhn.analytics.semantic.baseline.SemanticCaseLoader;
import com.rhn.analytics.semantic.model.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

class SemanticCatalogTest {

    private OutpatientSemanticCatalogProvider provider;
    private SemanticCatalog catalog;
    private MetricRegistry metricRegistry;
    private DimensionRegistry dimensionRegistry;
    private RelationshipRegistry relationshipRegistry;

    @BeforeEach
    void setUp() {
        provider = new OutpatientSemanticCatalogProvider();
        catalog = provider.getCatalog();
        metricRegistry = provider.getMetricRegistry();
        dimensionRegistry = provider.getDimensionRegistry();
        relationshipRegistry = provider.getRelationshipRegistry();
    }

    @Test
    @DisplayName("Catalog 基础结构校验：版本、领域、实体数与指标数")
    void catalog_basic_structure_and_counts() {
        assertEquals("1.0.0", catalog.version());
        assertEquals("OUTPATIENT", catalog.domain());
        assertEquals(7, catalog.entities().size(), "门诊域应包含 7 个实体（含科室主数据实体）");
        assertEquals(9, catalog.relationships().size(), "门诊域应包含 9 个关系（含科室主数据多对一关系）");
        assertTrue(catalog.metrics().size() >= 10, "第一批指标应至少达到 10 个，实际: " + catalog.metrics().size());
        assertEquals(15, catalog.metrics().size(), "首批包含 15 个门诊核心业务指标");
        assertTrue(catalog.dimensions().size() >= 8, "第一批维度应至少达到 8 个，实际: " + catalog.dimensions().size());
        assertEquals(9, catalog.dimensions().size(), "首批包含 9 个核心维度");
    }

    @Test
    @DisplayName("科室语义区分：必须独立区分 ENCOUNTER_DEPARTMENT、ORDER_DEPARTMENT 与 CHARGE_DEPARTMENT")
    void department_dimensions_are_properly_distinguished() {
        Optional<DimensionDefinition> encDept = dimensionRegistry.findByCode("ENCOUNTER_DEPARTMENT");
        Optional<DimensionDefinition> orderDept = dimensionRegistry.findByCode("ORDER_DEPARTMENT");
        Optional<DimensionDefinition> chargeDept = dimensionRegistry.findByCode("CHARGE_DEPARTMENT");

        assertTrue(encDept.isPresent(), "必须存在就诊科室维度");
        assertTrue(orderDept.isPresent(), "必须存在医嘱开立科室维度");
        assertTrue(chargeDept.isPresent(), "必须存在费用收费科室维度");

        assertEquals("ENCOUNTER", encDept.get().entity());
        assertEquals("ORDER", orderDept.get().entity());
        assertEquals("CHARGE", chargeDept.get().entity());

        // 别名检索验证
        assertEquals("CHARGE_DEPARTMENT", dimensionRegistry.findByAlias("费用科室").map(DimensionDefinition::code).orElse(null));
        assertEquals("CHARGE_DEPARTMENT", dimensionRegistry.findByAlias("记账科室").map(DimensionDefinition::code).orElse(null));
        assertEquals("ORDER_DEPARTMENT", dimensionRegistry.findByAlias("开立科室").map(DimensionDefinition::code).orElse(null));
        assertEquals("ENCOUNTER_DEPARTMENT", dimensionRegistry.findByAlias("就诊科室").map(DimensionDefinition::code).orElse(null));
    }

    @Test
    @DisplayName("指标别名精准解析：药品费用/药费 -> OP_DRUG_CHARGE_AMOUNT")
    void metric_alias_resolution() {
        for (String alias : List.of("药品费用", "药费", "门诊药费")) {
            Optional<MetricDefinition> metric = metricRegistry.findByAlias(alias);
            assertTrue(metric.isPresent(), "别名应能成功解析: " + alias);
            assertEquals("OP_DRUG_CHARGE_AMOUNT", metric.get().code());
            assertEquals(Aggregate.SUM, metric.get().aggregate());
            assertEquals("CHARGE", metric.get().source());
            assertEquals("amount", metric.get().field());

            // 必须包含固化在模型中的默认过滤条件，不再依赖 Prompt
            assertEquals(3, metric.get().defaultFilters().size());
            assertEquals("orderKind", metric.get().defaultFilters().get(0).field());
            assertEquals("MEDICATION", metric.get().defaultFilters().get(0).values().get(0));
            assertEquals("orderStatus", metric.get().defaultFilters().get(1).field());
            assertEquals("ACTIVE", metric.get().defaultFilters().get(1).values().get(0));
            assertEquals("deptType", metric.get().defaultFilters().get(2).field());
            assertEquals("CLINICAL", metric.get().defaultFilters().get(2).values().get(0));
        }

        // 验证有效医嘱与就诊人次别名
        assertEquals("OP_ACTIVE_ORDER_COUNT", metricRegistry.findByAlias("有效医嘱数").map(MetricDefinition::code).orElse(null));
        assertEquals("OP_ENCOUNTER_COUNT", metricRegistry.findByAlias("就诊人次").map(MetricDefinition::code).orElse(null));
        assertEquals("OP_COMPLETED_COUNT", metricRegistry.findByAlias("诊毕人次").map(MetricDefinition::code).orElse(null));
    }

    @Test
    @DisplayName("主数据实体与维度属性网络：DEPARTMENT 实体、多对一关系与 dept_type 属性")
    void department_entity_and_attributes_are_modeled() {
        // 实体存在
        EntityDefinition dept = catalog.entities().stream()
            .filter(e -> e.code().equals("DEPARTMENT"))
            .findFirst()
            .orElseThrow();
        assertEquals("ID_DEPT", dept.primaryKey());

        // 关系存在：CHARGE -> DEPARTMENT, ORDER -> DEPARTMENT, ENCOUNTER -> DEPARTMENT
        assertTrue(catalog.relationships().stream().anyMatch(r ->
            r.from().equals("CHARGE") && r.to().equals("DEPARTMENT") && r.cardinality() == Cardinality.MANY_TO_ONE));
        assertTrue(catalog.relationships().stream().anyMatch(r ->
            r.from().equals("ORDER") && r.to().equals("DEPARTMENT") && r.cardinality() == Cardinality.MANY_TO_ONE));
        assertTrue(catalog.relationships().stream().anyMatch(r ->
            r.from().equals("ENCOUNTER") && r.to().equals("DEPARTMENT") && r.cardinality() == Cardinality.MANY_TO_ONE));

        // 维度属性挂载：CHARGE_DEPARTMENT 包含 dept_type 属性
        DimensionDefinition chargeDept = dimensionRegistry.findByCode("CHARGE_DEPARTMENT").orElseThrow();
        assertFalse(chargeDept.attributes().isEmpty());
        DimensionAttribute attr = chargeDept.attributes().get(0);
        assertEquals("dept_type", attr.code());
        assertEquals("SD_DEPT_TYPE", attr.physicalColumn());
        assertTrue(attr.valueAliases().containsKey("CLINICAL"));
        assertTrue(attr.valueAliases().get("CLINICAL").contains("诊疗科室"));
    }

    @Test
    @DisplayName("指标禁用含义（Forbidden Meanings）：费用发生额严禁作为实际收款或医保到账")
    void forbidden_meanings_are_enforced_in_metric_definition() {
        MetricDefinition drugCharge = metricRegistry.findByCode("OP_DRUG_CHARGE_AMOUNT").orElseThrow();
        assertTrue(drugCharge.forbiddenMeanings().contains("实际收款"));
        assertTrue(drugCharge.forbiddenMeanings().contains("医保到账"));
        assertTrue(drugCharge.forbiddenMeanings().contains("药品实收"));

        MetricDefinition totalCharge = metricRegistry.findByCode("OP_TOTAL_CHARGE_AMOUNT").orElseThrow();
        assertTrue(totalCharge.forbiddenMeanings().contains("实际收款"));
        assertTrue(totalCharge.forbiddenMeanings().contains("已结算收入"));
        assertTrue(totalCharge.forbiddenMeanings().contains("医保到账"));
    }

    @Test
    @DisplayName("实体间拓扑关系与扇出放大风险（Fanout Risk）检测")
    void fanout_risk_detection() {
        // ENCOUNTER -> DIAGNOSIS (1:N) & ENCOUNTER -> ORDER (1:N) 同时展开具有扇出放大风险
        boolean hasFanout = relationshipRegistry.hasFanoutRisk("ENCOUNTER", "DIAGNOSIS", "ORDER");
        assertTrue(hasFanout, "ENCOUNTER 同时展开 DIAGNOSIS 与 ORDER 时必须检测出 fanoutRisk");

        // ORDER -> CHARGE 聚合安全
        boolean isSafe = relationshipRegistry.isAggregationSafe("ORDER", "CHARGE");
        assertTrue(isSafe, "ORDER 到 CHARGE 的记账聚合应是安全的");

        // 实体主键与粒度完整
        EntityDefinition patient = catalog.entities().stream().filter(e -> e.code().equals("PATIENT")).findFirst().orElseThrow();
        assertEquals("ID_PAT", patient.primaryKey());
        assertEquals("PATIENT_RECORD", patient.grain());
    }

    @Test
    @DisplayName("Baseline 回归测试集全部 READY 用例的指标与维度均在 Catalog 中完整支持")
    void all_baseline_ready_cases_are_covered_by_catalog() {
        List<SemanticCase> cases = SemanticCaseLoader.loadAllCases();

        for (SemanticCase c : cases) {
            if (c.expected().status() == SemanticCase.Status.READY) {
                // 验证预期指标已注册
                for (String metricCode : c.expected().metrics()) {
                    Optional<MetricDefinition> m = metricRegistry.findByCode(metricCode);
                    assertTrue(m.isPresent(), "Baseline 用例 " + c.id() + " 中指标未注册: " + metricCode);
                }
                // 验证预期维度已注册
                for (String dimCode : c.expected().dimensions()) {
                    Optional<DimensionDefinition> d = dimensionRegistry.findByCode(dimCode);
                    assertTrue(d.isPresent(), "Baseline 用例 " + c.id() + " 中维度未注册: " + dimCode);
                }
            }
        }
    }
}
