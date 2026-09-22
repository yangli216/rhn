package com.rhn.analytics.semantic.plan;

import com.rhn.analytics.semantic.model.*;
import com.rhn.analytics.semantic.registry.OutpatientSemanticCatalogProvider;
import com.rhn.analytics.semantic.resolver.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class QueryPlannerTest {

    private OutpatientSemanticCatalogProvider catalogProvider;
    private SemanticResolver resolver;
    private QueryPlanner planner;

    @BeforeEach
    void setUp() {
        catalogProvider = new OutpatientSemanticCatalogProvider();
        resolver = new SemanticResolver(catalogProvider);
        planner = new QueryPlanner(catalogProvider);
    }

    @Test
    @DisplayName("典型案例：‘本月各科室药品费用’ -> 生成以收费明细为中心，关联科室与医嘱的安全逻辑计划")
    void plan_drug_charge_by_department() {
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

        LocalDate testToday = LocalDate.of(2026, 9, 17);
        LogicalQueryPlan plan = planner.plan(resolution.query(), PlannedScope.defaultDevScope(), testToday);

        assertNotNull(plan);
        assertEquals("CHARGE", plan.primaryEntity());
        assertEquals("RHN_BIL_CHARGE_ITEM", plan.primaryTable());
        assertEquals("t0", plan.primaryAlias());
        assertEquals("CHARGE_ITEM", plan.grain());

        // 验证 Join 规划：需要通过就诊 (enc) 桥接关联科室 (dept)，并关联医嘱 (req)
        assertEquals(3, plan.joins().size());

        PlannedJoin encJoin = plan.joins().stream()
            .filter(j -> j.toEntity().equals("ENCOUNTER"))
            .findFirst().orElse(null);
        assertNotNull(encJoin);
        assertEquals("RHN_VIS_ENC", encJoin.toTable());
        assertEquals("enc", encJoin.toAlias());
        assertEquals("t0", encJoin.fromAlias());
        assertTrue(encJoin.conditions().stream().anyMatch(c -> c.fromField().equals("ID_ENC") && c.toField().equals("ID_ENC")));

        PlannedJoin deptJoin = plan.joins().stream()
            .filter(j -> j.toEntity().equals("DEPARTMENT"))
            .findFirst().orElse(null);
        assertNotNull(deptJoin);
        assertEquals("RHN_SYS_DEPT", deptJoin.toTable());
        assertEquals("dept", deptJoin.toAlias());
        assertEquals("enc", deptJoin.fromAlias());
        assertEquals(JoinType.LEFT_JOIN, deptJoin.joinType());
        assertTrue(deptJoin.conditions().stream().anyMatch(c -> c.fromField().equals("ID_DEPT") && c.toField().equals("ID_DEPT")));
        assertTrue(deptJoin.conditions().stream().anyMatch(c -> c.fromField().equals("ID_TNT") && c.toField().equals("ID_TNT")));

        PlannedJoin orderJoin = plan.joins().stream()
            .filter(j -> j.toEntity().equals("ORDER"))
            .findFirst().orElse(null);
        assertNotNull(orderJoin);
        assertEquals("RHN_EX_CARE_REQ", orderJoin.toTable());
        assertEquals("req", orderJoin.toAlias());

        // 验证维度规划：科室维度映射到 dept.ID_DEPT
        assertEquals(1, plan.dimensions().size());
        PlannedDimension dim = plan.dimensions().get(0);
        assertEquals("CHARGE_DEPARTMENT", dim.dimensionCode());
        assertEquals("dept", dim.tableAlias());
        assertEquals("ID_DEPT", dim.column());

        // 验证度量规划：药品费用 SUM(AMT_TOTAL)
        assertEquals(1, plan.measures().size());
        PlannedMeasure measure = plan.measures().get(0);
        assertEquals("OP_DRUG_CHARGE_AMOUNT", measure.measureCode());
        assertEquals(Aggregate.SUM, measure.aggregate());
        assertEquals("AMT_TOTAL", measure.column());

        // 验证谓词下推规划（安全范围 + 医嘱类型/状态 + 科室属性过滤）
        assertTrue(plan.filters().stream().anyMatch(f ->
            "req".equals(f.tableAlias()) && "SD_REQ_KIND".equals(f.column()) && f.values().contains("MEDICATION")));
        assertTrue(plan.filters().stream().anyMatch(f ->
            "req".equals(f.tableAlias()) && "SD_STATUS".equals(f.column()) && f.values().contains("ACTIVE")));
        assertTrue(plan.filters().stream().anyMatch(f ->
            "dept".equals(f.tableAlias()) && "SD_DEPT_TYPE".equals(f.column()) && f.values().contains("CLINICAL")));

        // 验证时间窗口
        assertNotNull(plan.timeRange());
        assertEquals("t0", plan.timeRange().tableAlias());
        assertEquals("DT_OCCRD", plan.timeRange().column());
        assertEquals(LocalDate.of(2026, 9, 1), plan.timeRange().startDate());
        assertEquals(LocalDate.of(2026, 9, 17), plan.timeRange().endDate());
    }

    @Test
    @DisplayName("典型案例：‘本月各科室药品费用，只显示诊疗科室’ -> 显式属性过滤精准下推")
    void plan_drug_charge_explicit_clinical_filter() {
        SemanticQuery query = new SemanticQuery(
            AnalysisIntent.METRIC_SUMMARY,
            List.of(new MetricIntent("药品费用")),
            List.of(new DimensionIntent("科室")),
            List.of(new FilterIntent("科室类别", "等于", List.of("诊疗科室"))),
            TimeIntent.monthToDate(),
            ScopeIntent.AUTHORIZED,
            null,
            null
        );

        Resolution resolution = resolver.resolve(query);
        assertEquals(ResolutionStatus.READY, resolution.status());

        LogicalQueryPlan plan = planner.plan(resolution.query());

        // 验证过滤器中包含显式下推的 dept.SD_DEPT_TYPE = CLINICAL
        assertTrue(plan.filters().stream().anyMatch(f ->
            "dept".equals(f.tableAlias()) &&
            "SD_DEPT_TYPE".equals(f.column()) &&
            f.operator() == Operator.EQ &&
            f.values().contains("CLINICAL")
        ));
    }

    @Test
    @DisplayName("多租户与组织安全切片下推验证")
    void plan_security_scope_pushdown() {
        SemanticQuery query = new SemanticQuery(
            AnalysisIntent.METRIC_SUMMARY,
            List.of(new MetricIntent("挂号人次")),
            List.of(new DimensionIntent("科室")),
            List.of(),
            TimeIntent.lastMonth(),
            ScopeIntent.AUTHORIZED,
            null,
            null
        );

        Resolution resolution = resolver.resolve(query);
        assertEquals(ResolutionStatus.READY, resolution.status());

        PlannedScope customScope = new PlannedScope(
            ScopeIntent.AUTHORIZED,
            888L,
            999L,
            Map.of(101L, "心血管内科", 102L, "呼吸内科")
        );

        LocalDate testToday = LocalDate.of(2026, 9, 17);
        LogicalQueryPlan plan = planner.plan(resolution.query(), customScope, testToday);

        assertEquals("ENCOUNTER", plan.primaryEntity());
        assertEquals("RHN_VIS_ENC", plan.primaryTable());

        // 验证多租户 ID_TNT = 888 下推
        assertTrue(plan.filters().stream().anyMatch(f ->
            f.isScopeFilter() && "ID_TNT".equals(f.column()) && f.values().contains("888")));

        // 验证组织 ID_ORG = 999 下推
        assertTrue(plan.filters().stream().anyMatch(f ->
            f.isScopeFilter() && "ID_ORG".equals(f.column()) && f.values().contains("999")));

        // 验证授权科室切片下推
        assertTrue(plan.filters().stream().anyMatch(f ->
            f.isScopeFilter() && "ID_DEPT".equals(f.column()) &&
            f.operator() == Operator.IN &&
            f.values().contains("101") && f.values().contains("102")));

        // 验证上月时间窗口 (2026-08-01 ~ 2026-08-31)
        assertEquals(LocalDate.of(2026, 8, 1), plan.timeRange().startDate());
        assertEquals(LocalDate.of(2026, 8, 31), plan.timeRange().endDate());
    }

    @Test
    @DisplayName("边界与衍生特性验证：按月聚合、自定义排序与限制、空指标保护")
    void plan_edge_cases_and_dimensions() {
        // 1. 空指标测试
        assertThrows(IllegalArgumentException.class, () -> {
            planner.plan(new ResolvedSemanticQuery(
                AnalysisIntent.METRIC_SUMMARY,
                List.of(),
                List.of(),
                List.of(),
                TimeIntent.monthToDate(),
                ScopeIntent.AUTHORIZED,
                null,
                null
            ));
        });

        // 2. 按月维度与排序
        SemanticQuery monthQuery = new SemanticQuery(
            AnalysisIntent.METRIC_SUMMARY,
            List.of(new MetricIntent("药品费用")),
            List.of(new DimensionIntent("月份")),
            List.of(),
            TimeIntent.yearToDate(),
            ScopeIntent.AUTHORIZED,
            new SortIntent("OP_DRUG_CHARGE_AMOUNT", "ASC"),
            5
        );

        Resolution res = resolver.resolve(monthQuery);
        assertEquals(ResolutionStatus.READY, res.status());

        LocalDate testToday = LocalDate.of(2026, 9, 17);
        LogicalQueryPlan plan = planner.plan(res.query(), PlannedScope.defaultDevScope(), testToday);

        assertEquals(1, plan.dimensions().size());
        assertEquals("MONTH", plan.dimensions().get(0).dimensionCode());
        assertEquals("TO_CHAR(t0.DT_OCCRD, 'YYYY-MM')", plan.dimensions().get(0).groupExpression());

        // 排序与限制
        assertEquals("OP_DRUG_CHARGE_AMOUNT", plan.sort().target());
        assertEquals("ASC", plan.sort().direction());
        assertEquals(5, plan.limit());

        // 年初至今
        assertEquals(LocalDate.of(2026, 1, 1), plan.timeRange().startDate());
        assertEquals(LocalDate.of(2026, 9, 17), plan.timeRange().endDate());
    }
}
