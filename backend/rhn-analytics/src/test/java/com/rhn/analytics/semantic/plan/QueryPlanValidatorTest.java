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

class QueryPlanValidatorTest {

    private QueryPlanner planner;
    private QueryPlanValidator validator;
    private SemanticResolver resolver;

    @BeforeEach
    void setUp() {
        OutpatientSemanticCatalogProvider provider = new OutpatientSemanticCatalogProvider();
        planner = new QueryPlanner(provider);
        validator = new QueryPlanValidator(provider);
        resolver = new SemanticResolver(provider);
    }

    @Test
    @DisplayName("合法计划验证：药品费用按科室计划应完全合规通过")
    void valid_plan_passes_validation() {
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

        Resolution res = resolver.resolve(query);
        assertEquals(ResolutionStatus.READY, res.status());

        LogicalQueryPlan plan = planner.plan(res.query(), PlannedScope.defaultDevScope(), LocalDate.of(2026, 9, 17));
        ValidationResult result = validator.validate(plan);

        assertTrue(result.isValid(), "计划应该通过校验，错误信息: " + result.errors());
        assertTrue(result.errors().isEmpty());
    }

    @Test
    @DisplayName("租户隔离拦截：若缺少租户隔离过滤，校验必须拒绝")
    void missing_tenant_filter_fails() {
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

        Resolution res = resolver.resolve(query);
        LogicalQueryPlan plan = planner.plan(res.query(), PlannedScope.defaultDevScope(), LocalDate.of(2026, 9, 17));

        // 故意剥离租户过滤
        List<PlannedFilter> tamperedFilters = plan.filters().stream()
            .filter(f -> !("ID_TNT".equals(f.column()) && f.isScopeFilter()))
            .toList();

        LogicalQueryPlan unsafePlan = new LogicalQueryPlan(
            plan.planId(),
            plan.primaryEntity(),
            plan.primaryTable(),
            plan.primaryAlias(),
            plan.grain(),
            plan.joins(),
            plan.dimensions(),
            plan.measures(),
            tamperedFilters,
            plan.timeRange(),
            plan.scope(),
            plan.sort(),
            plan.limit()
        );

        ValidationResult result = validator.validate(unsafePlan);
        assertFalse(result.isValid());
        assertTrue(result.errors().stream().anyMatch(e -> e.contains("缺失多租户隔离过滤")));
    }

    @Test
    @DisplayName("时间窗口边界拦截：开始日期晚于结束日期必须被拒绝")
    void invalid_time_range_fails() {
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

        Resolution res = resolver.resolve(query);
        LogicalQueryPlan plan = planner.plan(res.query(), PlannedScope.defaultDevScope(), LocalDate.of(2026, 9, 17));

        PlannedTimeRange invalidTimeRange = new PlannedTimeRange(
            plan.primaryEntity(),
            plan.primaryAlias(),
            "DT_OCCRD",
            "CUSTOM",
            LocalDate.of(2026, 9, 30),
            LocalDate.of(2026, 9, 1) // 结束早于开始
        );

        LogicalQueryPlan tamperedPlan = new LogicalQueryPlan(
            plan.planId(),
            plan.primaryEntity(),
            plan.primaryTable(),
            plan.primaryAlias(),
            plan.grain(),
            plan.joins(),
            plan.dimensions(),
            plan.measures(),
            plan.filters(),
            invalidTimeRange,
            plan.scope(),
            plan.sort(),
            plan.limit()
        );

        ValidationResult result = validator.validate(tamperedPlan);
        assertFalse(result.isValid());
        assertTrue(result.errors().stream().anyMatch(e -> e.contains("晚于结束日期")));
    }

    @Test
    @DisplayName("行数与开销保护：Limit 超出安全上限必须被拒绝")
    void excessive_limit_fails() {
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

        Resolution res = resolver.resolve(query);
        LogicalQueryPlan plan = planner.plan(res.query(), PlannedScope.defaultDevScope(), LocalDate.of(2026, 9, 17));

        LogicalQueryPlan tamperedPlan = new LogicalQueryPlan(
            plan.planId(),
            plan.primaryEntity(),
            plan.primaryTable(),
            plan.primaryAlias(),
            plan.grain(),
            plan.joins(),
            plan.dimensions(),
            plan.measures(),
            plan.filters(),
            plan.timeRange(),
            plan.scope(),
            plan.sort(),
            99999 // 超出上限
        );

        ValidationResult result = validator.validate(tamperedPlan);
        assertFalse(result.isValid());
        assertTrue(result.errors().stream().anyMatch(e -> e.contains("超过最大上限")));
    }

    @Test
    @DisplayName("扇出风险拦截：检测并拒绝一对多未聚合关联")
    void fanout_join_fails() {
        SemanticQuery query = new SemanticQuery(
            AnalysisIntent.METRIC_SUMMARY,
            List.of(new MetricIntent("挂号人次")),
            List.of(),
            List.of(),
            TimeIntent.monthToDate(),
            ScopeIntent.AUTHORIZED,
            null,
            null
        );

        Resolution res = resolver.resolve(query);
        LogicalQueryPlan plan = planner.plan(res.query(), PlannedScope.defaultDevScope(), LocalDate.of(2026, 9, 17));

        // 试图从 ENCOUNTER (1) 扇出 Join 到 CHARGE (N)
        PlannedJoin fanoutJoin = new PlannedJoin(
            "ENCOUNTER",
            "CHARGE",
            "RHN_BIL_CHARGE_ITEM",
            "t_charge",
            JoinType.LEFT_JOIN,
            List.of(JoinCondition.on("ID_ENC", "ID_ENC")),
            "高危扇出关联"
        );

        LogicalQueryPlan fanoutPlan = new LogicalQueryPlan(
            plan.planId(),
            plan.primaryEntity(),
            plan.primaryTable(),
            plan.primaryAlias(),
            plan.grain(),
            List.of(fanoutJoin),
            plan.dimensions(),
            plan.measures(),
            plan.filters(),
            plan.timeRange(),
            plan.scope(),
            plan.sort(),
            plan.limit()
        );

        ValidationResult result = validator.validate(fanoutPlan);
        assertFalse(result.isValid());
        assertTrue(result.errors().stream().anyMatch(e -> e.contains("扇出 Join 风险")));
    }
}
