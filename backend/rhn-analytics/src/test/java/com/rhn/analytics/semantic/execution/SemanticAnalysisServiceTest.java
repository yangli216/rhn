package com.rhn.analytics.semantic.execution;

import com.rhn.analytics.semantic.interpreter.AnalysisIntentInterpreter;
import com.rhn.analytics.semantic.model.*;
import com.rhn.analytics.semantic.plan.*;
import com.rhn.analytics.semantic.registry.OutpatientSemanticCatalogProvider;
import com.rhn.analytics.semantic.resolver.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

class SemanticAnalysisServiceTest {

    private SemanticAnalysisService service;
    private AnalysisIntentInterpreter mockInterpreter;

    @BeforeEach
    void setUp() {
        // 创建独立隔离的 H2 内存库
        DriverManagerDataSource ds = new DriverManagerDataSource();
        ds.setDriverClassName("org.h2.Driver");
        ds.setUrl("jdbc:h2:mem:service_test_" + UUID.randomUUID().toString().replace("-", "") + ";MODE=Oracle;DB_CLOSE_DELAY=-1");
        ds.setUsername("sa");
        ds.setPassword("");

        NamedParameterJdbcTemplate namedJdbcTemplate = new NamedParameterJdbcTemplate(ds);
        JdbcTemplate jdbcTemplate = new JdbcTemplate(ds);
        JdbcStructuredExecutionEngine engine = new JdbcStructuredExecutionEngine(namedJdbcTemplate);

        OutpatientSemanticCatalogProvider provider = new OutpatientSemanticCatalogProvider();
        SemanticResolver resolver = new SemanticResolver(provider);
        QueryPlanner planner = new QueryPlanner(provider);
        QueryPlanValidator validator = new QueryPlanValidator(provider);
        QueryCompiler compiler = new QueryCompiler();

        mockInterpreter = Mockito.mock(AnalysisIntentInterpreter.class);

        service = new SemanticAnalysisService(
            mockInterpreter,
            resolver,
            planner,
            validator,
            compiler,
            engine,
            null,
            null
        );

        // 建表与准备种子数据
        jdbcTemplate.execute("""
            CREATE TABLE RHN_SYS_DEPT (
                ID_DEPT BIGINT PRIMARY KEY,
                ID_TNT BIGINT NOT NULL,
                NA_DEPT VARCHAR(100) NOT NULL,
                SD_DEPT_TYPE VARCHAR(50) NOT NULL
            );
            CREATE TABLE RHN_VIS_ENC (
                ID_ENC BIGINT PRIMARY KEY,
                ID_TNT BIGINT NOT NULL,
                ID_ORG BIGINT NOT NULL,
                ID_DEPT BIGINT NOT NULL
            );
            CREATE TABLE RHN_EX_CARE_REQ (
                ID_CARE_REQ BIGINT PRIMARY KEY,
                ID_TNT BIGINT NOT NULL,
                SD_REQ_KIND VARCHAR(50) NOT NULL,
                SD_STATUS VARCHAR(50) NOT NULL
            );
            CREATE TABLE RHN_BIL_CHARGE_ITEM (
                ID_CHARGE_ITEM BIGINT PRIMARY KEY,
                ID_TNT BIGINT NOT NULL,
                ID_ORG BIGINT NOT NULL,
                ID_DEPT BIGINT NOT NULL,
                ID_ENC BIGINT NOT NULL,
                ID_CARE_REQ BIGINT,
                AMT_TOTAL DECIMAL(12, 2) NOT NULL,
                DT_OCCURRED TIMESTAMP NOT NULL
            );
            INSERT INTO RHN_SYS_DEPT VALUES (101, 888, '心血管内科', 'CLINICAL');
            INSERT INTO RHN_VIS_ENC VALUES (201, 888, 999, 101);
            INSERT INTO RHN_EX_CARE_REQ VALUES (501, 888, 'MEDICATION', 'ACTIVE');
            INSERT INTO RHN_BIL_CHARGE_ITEM VALUES (1, 888, 999, 101, 201, 501, 100.00, TIMESTAMP '2026-09-10 10:00:00');
        """);
    }

    @Test
    @DisplayName("端到端执行：READY 查询顺畅完成消歧、规划、校验、编译并在物理库执行成功")
    void executeEndToEnd_ready_query_succeeds() {
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

        PlannedScope scope = new PlannedScope(
            ScopeIntent.AUTHORIZED,
            888L,
            999L,
            Map.of(101L, "心血管内科")
        );

        ExecutionResult result = service.executeEndToEnd(query, scope);

        assertEquals(ResolutionStatus.READY, result.status());
        assertEquals(1, result.totalRows());
        assertEquals(new BigDecimal("100.00"), new BigDecimal(result.rows().get(0).get("m_OP_DRUG_CHARGE_AMOUNT").toString()));
        assertNotNull(result.compiledSql());
        assertTrue(result.compiledSql().contains("RHN_BIL_CHARGE_ITEM"));
    }

    @Test
    @DisplayName("端到端执行：歧义查询直接拦截并返回澄清选项，杜绝幻觉与物理执行")
    void executeEndToEnd_ambiguous_query_returns_clarify() {
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

        ExecutionResult result = service.executeEndToEnd(query, null);

        assertEquals(ResolutionStatus.CLARIFY, result.status());
        assertNotNull(result.clarification());
        assertEquals("REVENUE_CONCEPT_AMBIGUOUS", result.clarification().code());
        assertTrue(result.clarification().options().size() >= 2);
        assertTrue(result.rows().isEmpty());
    }

    @Test
    @DisplayName("端到端执行：跨实体笛卡尔积高危查询直接拦截，杜绝扇出与错误统计")
    void executeEndToEnd_unsupported_fanout_query_rejected() {
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

        ExecutionResult result = service.executeEndToEnd(query, null);

        assertEquals(ResolutionStatus.UNSUPPORTED, result.status());
        assertTrue(result.explanation().contains("扇出放大"));
        assertTrue(result.rows().isEmpty());
    }

    @Test
    @DisplayName("端到端自然语言驱动：LLM 意图解析 -> 端到端链路完整打通")
    void executeNaturalLanguage_succeeds() {
        SemanticQuery mockQuery = new SemanticQuery(
            AnalysisIntent.METRIC_SUMMARY,
            List.of(new MetricIntent("药品费用")),
            List.of(new DimensionIntent("科室")),
            List.of(),
            TimeIntent.monthToDate(),
            ScopeIntent.AUTHORIZED,
            null,
            null
        );

        Mockito.when(mockInterpreter.interpret(Mockito.any())).thenReturn(mockQuery);

        PlannedScope scope = new PlannedScope(
            ScopeIntent.AUTHORIZED,
            888L,
            999L,
            Map.of(101L, "心血管内科")
        );

        ExecutionResult result = service.executeNaturalLanguage("查看本月各科室药品费用", scope);

        assertEquals(ResolutionStatus.READY, result.status());
        assertEquals(1, result.totalRows());
    }
}
