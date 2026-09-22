package com.rhn.analytics.semantic.plan;

import com.rhn.analytics.semantic.model.*;
import com.rhn.analytics.semantic.registry.OutpatientSemanticCatalogProvider;
import com.rhn.analytics.semantic.resolver.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class QueryCompilerTest {

    private QueryPlanner planner;
    private QueryPlanValidator validator;
    private QueryCompiler compiler;
    private SemanticResolver resolver;

    @BeforeEach
    void setUp() {
        OutpatientSemanticCatalogProvider provider = new OutpatientSemanticCatalogProvider();
        planner = new QueryPlanner(provider);
        validator = new QueryPlanValidator(provider);
        compiler = new QueryCompiler();
        resolver = new SemanticResolver(provider);
    }

    @Test
    @DisplayName("典型案例：‘本月各科室药品费用’ -> 编译为严谨参数化 SQL 并正确绑定多表 Join 与默认业务过滤")
    void compile_drug_charge_by_department() {
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

        LocalDate testToday = LocalDate.of(2026, 9, 17);
        PlannedScope testScope = new PlannedScope(
            ScopeIntent.AUTHORIZED,
            1001L,
            2001L,
            Map.of(301L, "心内科", 302L, "呼吸科")
        );

        LogicalQueryPlan plan = planner.plan(res.query(), testScope, testToday);
        ValidationResult validation = validator.validate(plan);
        assertTrue(validation.isValid(), "生成的计划必须通过安全校验: " + validation.errors());

        CompiledQuery compiled = compiler.compile(plan);
        assertNotNull(compiled);

        String sql = compiled.sql();
        Map<String, Object> params = compiled.parameters();

        // 1. 验证 SELECT 子句与列映射
        assertTrue(sql.contains("dept.ID_DEPT AS dim_CHARGE_DEPARTMENT"), "SQL 必须包含科室维度字段别名: " + sql);
        assertTrue(sql.contains("SUM(t0.AMT_TOTAL) AS m_OP_DRUG_CHARGE_AMOUNT"), "SQL 必须包含度量聚合计算: " + sql);

        assertEquals(2, compiled.columns().size());
        assertEquals("dim_CHARGE_DEPARTMENT", compiled.columns().get(0).alias());
        assertEquals("m_OP_DRUG_CHARGE_AMOUNT", compiled.columns().get(1).alias());

        // 2. 验证 FROM 与 JOIN 关联
        assertTrue(sql.contains("FROM RHN_BIL_CHARGE_ITEM t0"), "主表必须为 RHN_BIL_CHARGE_ITEM: " + sql);
        assertTrue(sql.contains("LEFT JOIN RHN_VIS_ENC enc ON t0.ID_ENC = enc.ID_ENC AND t0.ID_TNT = enc.ID_TNT"), "必须关联门诊就诊以桥接科室: " + sql);
        assertTrue(sql.contains("LEFT JOIN RHN_SYS_DEPT dept ON enc.ID_DEPT = dept.ID_DEPT AND enc.ID_TNT = dept.ID_TNT"), "必须关联科室主数据并附带多租户条件: " + sql);
        assertTrue(sql.contains("LEFT JOIN RHN_EX_CARE_REQ req ON t0.ID_CARE_REQ = req.ID_CARE_REQ AND t0.ID_TNT = req.ID_TNT"), "必须关联医嘱主表并附带多租户条件: " + sql);

        // 3. 验证时间范围窗口半开区间绑定
        assertTrue(sql.contains("t0.DT_OCCRD >= :p_time_start AND t0.DT_OCCRD < :p_time_end"), "必须为半开区间时间过滤: " + sql);
        assertEquals(LocalDateTime.of(2026, 9, 1, 0, 0, 0), params.get("p_time_start"));
        assertEquals(LocalDateTime.of(2026, 9, 18, 0, 0, 0), params.get("p_time_end"));

        // 4. 验证安全切片参数绑定 (多租户、组织、授权科室)
        assertTrue(params.containsValue(1001L), "参数中必须包含租户 ID: 1001");
        assertTrue(params.containsValue(2001L), "参数中必须包含组织 ID: 2001");

        // 5. 验证指标业务默认规则下推 (orderKind=MEDICATION, orderStatus=ACTIVE, deptType=CLINICAL)
        assertTrue(params.containsValue("MEDICATION"), "必须绑定药品类别过滤");
        assertTrue(params.containsValue("ACTIVE"), "必须绑定医嘱有效状态过滤");
        assertTrue(params.containsValue("CLINICAL"), "必须绑定诊疗科室属性过滤");

        // 6. 验证 GROUP BY 与 ORDER BY
        assertTrue(sql.contains("GROUP BY dept.ID_DEPT"), "必须包含 GROUP BY dept.ID_DEPT");
        assertTrue(sql.contains("ORDER BY m_OP_DRUG_CHARGE_AMOUNT DESC"), "必须使用度量别名排序");
        assertTrue(sql.contains("FETCH FIRST 10 ROWS ONLY"), "必须包含 FETCH FIRST 限制");
    }

    @Test
    @DisplayName("典型案例：‘本月各科室药品费用，只显示诊疗科室’ -> 显式属性过滤编译")
    void compile_drug_charge_explicit_clinical_filter() {
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

        Resolution res = resolver.resolve(query);
        LogicalQueryPlan plan = planner.plan(res.query());
        ValidationResult validation = validator.validate(plan);
        assertTrue(validation.isValid());

        CompiledQuery compiled = compiler.compile(plan);
        assertTrue(compiled.sql().contains("dept.SD_DEPT_TYPE = :"));
        assertTrue(compiled.parameters().containsValue("CLINICAL"));
    }

    @Test
    @DisplayName("按月聚合维度与自定义排序限制编译")
    void compile_monthly_aggregation_and_sort() {
        SemanticQuery query = new SemanticQuery(
            AnalysisIntent.METRIC_SUMMARY,
            List.of(new MetricIntent("挂号人次")),
            List.of(new DimensionIntent("月份")),
            List.of(),
            TimeIntent.yearToDate(),
            ScopeIntent.AUTHORIZED,
            new SortIntent("OP_REGISTER_COUNT", "ASC"),
            20
        );

        Resolution res = resolver.resolve(query);
        LogicalQueryPlan plan = planner.plan(res.query());
        ValidationResult validation = validator.validate(plan);
        assertTrue(validation.isValid());

        CompiledQuery compiled = compiler.compile(plan);
        String sql = compiled.sql();

        assertTrue(sql.contains("TO_CHAR(t0.DT_REGD, 'YYYY-MM') AS dim_MONTH"));
        assertTrue(sql.contains("COUNT(t0.ID_ENC) AS m_OP_REGISTER_COUNT"));
        assertTrue(sql.contains("GROUP BY TO_CHAR(t0.DT_REGD, 'YYYY-MM')"));
        assertTrue(sql.contains("ORDER BY m_OP_REGISTER_COUNT ASC"));
        assertTrue(sql.contains("FETCH FIRST 20 ROWS ONLY"));
        assertEquals(20, compiled.limit());
    }
}
