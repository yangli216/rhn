package com.rhn.analytics.semantic.execution;

import com.rhn.analytics.semantic.model.*;
import com.rhn.analytics.semantic.plan.*;
import com.rhn.analytics.semantic.registry.OutpatientSemanticCatalogProvider;
import com.rhn.analytics.semantic.resolver.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

class JdbcStructuredExecutionEngineTest {

    private NamedParameterJdbcTemplate namedJdbcTemplate;
    private JdbcTemplate jdbcTemplate;
    private JdbcStructuredExecutionEngine engine;
    private QueryPlanner planner;
    private QueryPlanValidator validator;
    private QueryCompiler compiler;
    private SemanticResolver resolver;

    @BeforeEach
    void setUp() {
        // 创建独立隔离的 H2 内存库（Oracle 兼容模式）
        DriverManagerDataSource ds = new DriverManagerDataSource();
        ds.setDriverClassName("org.h2.Driver");
        ds.setUrl("jdbc:h2:mem:analytics_engine_test_" + UUID.randomUUID().toString().replace("-", "") + ";MODE=Oracle;DB_CLOSE_DELAY=-1");
        ds.setUsername("sa");
        ds.setPassword("");

        namedJdbcTemplate = new NamedParameterJdbcTemplate(ds);
        jdbcTemplate = new JdbcTemplate(ds);
        engine = new JdbcStructuredExecutionEngine(namedJdbcTemplate);

        OutpatientSemanticCatalogProvider provider = new OutpatientSemanticCatalogProvider();
        planner = new QueryPlanner(provider);
        validator = new QueryPlanValidator(provider);
        compiler = new QueryCompiler();
        resolver = new SemanticResolver(provider);

        // 初始化物理数据表结构
        initSchema();
        // 初始化业务实体测试数据
        seedTestData();
    }

    private void initSchema() {
        jdbcTemplate.execute("""
            CREATE TABLE RHN_SYS_DEPT (
                ID_DEPT BIGINT PRIMARY KEY,
                ID_TNT BIGINT NOT NULL,
                NA_DEPT VARCHAR(100) NOT NULL,
                SD_DEPT_TYPE VARCHAR(50) NOT NULL
            )
        """);

        jdbcTemplate.execute("""
            CREATE TABLE RHN_VIS_ENC (
                ID_ENC BIGINT PRIMARY KEY,
                ID_TNT BIGINT NOT NULL,
                ID_ORG BIGINT NOT NULL,
                ID_DEPT BIGINT NOT NULL
            )
        """);

        jdbcTemplate.execute("""
            CREATE TABLE RHN_EX_CARE_REQ (
                ID_CARE_REQ BIGINT PRIMARY KEY,
                ID_TNT BIGINT NOT NULL,
                SD_REQ_KIND VARCHAR(50) NOT NULL,
                SD_STATUS VARCHAR(50) NOT NULL
            )
        """);

        jdbcTemplate.execute("""
            CREATE TABLE RHN_BIL_CHARGE_ITEM (
                ID_CHARGE_ITEM BIGINT PRIMARY KEY,
                ID_TNT BIGINT NOT NULL,
                ID_ORG BIGINT NOT NULL,
                ID_DEPT BIGINT NOT NULL,
                ID_ENC BIGINT NOT NULL,
                ID_CARE_REQ BIGINT,
                AMT_TOTAL DECIMAL(12, 2) NOT NULL,
                DT_OCCRD TIMESTAMP NOT NULL
            )
        """);
    }

    private void seedTestData() {
        // 科室：包含临床诊疗科室、药剂科库房、行政科室
        jdbcTemplate.update("INSERT INTO RHN_SYS_DEPT VALUES (101, 888, '心血管内科', 'CLINICAL')");
        jdbcTemplate.update("INSERT INTO RHN_SYS_DEPT VALUES (102, 888, '呼吸内科', 'CLINICAL')");
        jdbcTemplate.update("INSERT INTO RHN_SYS_DEPT VALUES (103, 888, '西药库房', 'PHARMACY')");
        jdbcTemplate.update("INSERT INTO RHN_SYS_DEPT VALUES (104, 888, '医务处', 'ADMINISTRATIVE')");

        // 就诊：通过就诊关联机构与科室
        jdbcTemplate.update("INSERT INTO RHN_VIS_ENC VALUES (201, 888, 999, 101)");
        jdbcTemplate.update("INSERT INTO RHN_VIS_ENC VALUES (202, 888, 999, 102)");
        jdbcTemplate.update("INSERT INTO RHN_VIS_ENC VALUES (203, 888, 999, 103)");

        // 医嘱：包含有效药品、作废药品、检查类医嘱
        jdbcTemplate.update("INSERT INTO RHN_EX_CARE_REQ VALUES (501, 888, 'MEDICATION', 'ACTIVE')");
        jdbcTemplate.update("INSERT INTO RHN_EX_CARE_REQ VALUES (502, 888, 'MEDICATION', 'ACTIVE')");
        jdbcTemplate.update("INSERT INTO RHN_EX_CARE_REQ VALUES (503, 888, 'MEDICATION', 'CANCELLED')");
        jdbcTemplate.update("INSERT INTO RHN_EX_CARE_REQ VALUES (504, 888, 'EXAM', 'ACTIVE')");

        // 费用明细 (租户 888, 机构 999, 科室 101/102/103)
        // 1. 心血管内科(就诊201)：有效药品 150.00
        jdbcTemplate.update("INSERT INTO RHN_BIL_CHARGE_ITEM VALUES (1, 888, 999, 101, 201, 501, 150.00, TIMESTAMP '2026-09-05 10:00:00')");
        // 2. 心血管内科(就诊201)：有效药品 80.00
        jdbcTemplate.update("INSERT INTO RHN_BIL_CHARGE_ITEM VALUES (2, 888, 999, 101, 201, 502, 80.00, TIMESTAMP '2026-09-10 11:30:00')");
        // 3. 呼吸内科(就诊202)：有效药品 220.00
        jdbcTemplate.update("INSERT INTO RHN_BIL_CHARGE_ITEM VALUES (3, 888, 999, 102, 202, 501, 220.00, TIMESTAMP '2026-09-12 14:20:00')");
        // 4. 心血管内科(就诊201)：已取消药品 999.00（必须被过滤排除）
        jdbcTemplate.update("INSERT INTO RHN_BIL_CHARGE_ITEM VALUES (4, 888, 999, 101, 201, 503, 999.00, TIMESTAMP '2026-09-08 09:15:00')");
        // 5. 西药库房(就诊203)：挂在库房上的费用 5000.00（必须被过滤排除）
        jdbcTemplate.update("INSERT INTO RHN_BIL_CHARGE_ITEM VALUES (5, 888, 999, 103, 203, 501, 5000.00, TIMESTAMP '2026-09-09 16:00:00')");
        // 6. 心血管内科(就诊201)：非药品检查费 300.00（必须被过滤排除）
        jdbcTemplate.update("INSERT INTO RHN_BIL_CHARGE_ITEM VALUES (6, 888, 999, 101, 201, 504, 300.00, TIMESTAMP '2026-09-11 15:45:00')");
        // 7. 其他租户的费用（必须被多租户强隔离排除）
        jdbcTemplate.update("INSERT INTO RHN_BIL_CHARGE_ITEM VALUES (7, 777, 999, 101, 201, 501, 8888.00, TIMESTAMP '2026-09-06 12:00:00')");
    }

    @Test
    @DisplayName("物理执行闭环验证：‘本月各科室药品费用’ -> 库房行政自动排除，取消与非药品自动排除，数据100%精准")
    void execute_drug_charge_by_department_filters_accurately() {
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

        PlannedScope scope = new PlannedScope(
            ScopeIntent.AUTHORIZED,
            888L,
            999L,
            Map.of(101L, "心血管内科", 102L, "呼吸内科", 103L, "西药库房")
        );

        LocalDate testToday = LocalDate.of(2026, 9, 17);
        LogicalQueryPlan plan = planner.plan(res.query(), scope, testToday);

        ValidationResult validation = validator.validate(plan);
        assertTrue(validation.isValid(), "计划必须通过校验");

        CompiledQuery compiled = compiler.compile(plan);
        ExecutionResult result = engine.execute(compiled);

        assertNotNull(result);
        assertEquals(ResolutionStatus.READY, result.status());

        // 验证返回行数：只应有 心血管内科(101) 和 呼吸内科(102) 两个诊疗科室！西药库房(103)已被排除！
        assertEquals(2, result.totalRows(), "库房和非诊疗科室必须被彻底排除，只应返回2个临床科室");
        assertEquals(2, result.rows().size());

        // 验证排序：按药品费用降序排列
        // 101 (心内科): 150.00 + 80.00 = 230.00
        // 102 (呼吸科): 220.00
        Map<String, Object> firstRow = result.rows().get(0);
        assertEquals(101L, ((Number) firstRow.get("dim_CHARGE_DEPARTMENT")).longValue());
        assertEquals(new BigDecimal("230.00"), new BigDecimal(firstRow.get("m_OP_DRUG_CHARGE_AMOUNT").toString()));

        Map<String, Object> secondRow = result.rows().get(1);
        assertEquals(102L, ((Number) secondRow.get("dim_CHARGE_DEPARTMENT")).longValue());
        assertEquals(new BigDecimal("220.00"), new BigDecimal(secondRow.get("m_OP_DRUG_CHARGE_AMOUNT").toString()));

        // 验证度量汇总摘要 (Summary)
        BigDecimal totalDrugAmount = (BigDecimal) result.summary().get("total_m_OP_DRUG_CHARGE_AMOUNT");
        assertNotNull(totalDrugAmount);
        assertEquals(new BigDecimal("450.00"), totalDrugAmount, "全院临床诊疗科室有效药费合计必须为 450.00");
    }
}
