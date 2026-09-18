package com.rhn.analytics.semantic.interpreter;

import com.rhn.ai.api.StructuredAiDirectory;
import com.rhn.analytics.api.AnalysisPage;
import com.rhn.analytics.semantic.model.*;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.json.JsonCodec;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

class AnalysisIntentInterpreterTest {

    private StructuredAiDirectory ai;
    private JsonCodec json;
    private AnalysisIntentInterpreter interpreter;

    @BeforeEach
    void setUp() {
        ai = mock(StructuredAiDirectory.class);
        json = new com.rhn.analytics.semantic.TestJsonCodec();
        interpreter = new AnalysisIntentInterpreter(ai, json, true);
    }

    @Test
    @DisplayName("单轮自然语言需求解析：药品费用科室排行准确映射为 SemanticQuery")
    void interprets_single_turn_ranking_query_into_semantic_query() {
        String mockResponse = """
            {
              "intent": "RANKING",
              "metrics": [{"text": "药品费用"}],
              "dimensions": [{"text": "科室"}],
              "period": {"type": "MONTH_TO_DATE"},
              "scope": "AUTHORIZED",
              "sort": {"metric": "药品费用", "direction": "DESC"},
              "limit": 10
            }
            """;
        when(ai.complete(anyString(), anyString())).thenReturn(mockResponse);

        SemanticQuery result = interpreter.interpret(
            "本月各科室药品费用从高到低",
            null,
            List.of(),
            LocalDate.of(2026, 9, 17)
        );

        assertNotNull(result);
        assertEquals(AnalysisIntent.RANKING, result.intent());
        assertEquals(1, result.metrics().size());
        assertEquals("药品费用", result.metrics().get(0).text());
        assertEquals(1, result.dimensions().size());
        assertEquals("科室", result.dimensions().get(0).text());
        assertEquals("MONTH_TO_DATE", result.period().type());
        assertEquals(ScopeIntent.AUTHORIZED, result.scope());
        assertNotNull(result.sort());
        assertEquals("DESC", result.sort().direction());
        assertEquals(10, result.limit());

        // 验证 AI 调用时传入的 Prompt
        verify(ai).complete(eq(AnalysisIntentInterpreter.SYSTEM_PROMPT), anyString());
    }

    @Test
    @DisplayName("歧义词提取：如‘本月门诊收入’保留原始描述，不猜测底层物理字段")
    void preserves_ambiguous_phrase_without_guessing_physical_columns() {
        String mockResponse = """
            {
              "intent": "METRIC_SUMMARY",
              "metrics": [{"text": "门诊收入"}],
              "dimensions": [],
              "period": {"type": "MONTH_TO_DATE"},
              "scope": "CURRENT"
            }
            """;
        when(ai.complete(anyString(), anyString())).thenReturn(mockResponse);

        SemanticQuery result = interpreter.interpret(
            "本月门诊收入",
            null,
            List.of(),
            LocalDate.of(2026, 9, 17)
        );

        assertNotNull(result);
        assertEquals(AnalysisIntent.METRIC_SUMMARY, result.intent());
        assertEquals(1, result.metrics().size());
        assertEquals("门诊收入", result.metrics().get(0).text());
        assertTrue(result.dimensions().isEmpty());
    }

    @Test
    @DisplayName("多轮交互与上下文继承：修改周期保留原指标与维度")
    void supports_multi_turn_followup_and_partial_update() {
        SemanticQuery base = new SemanticQuery(
            AnalysisIntent.METRIC_SUMMARY,
            List.of(new MetricIntent("有效药品医嘱条数")),
            List.of(new DimensionIntent("科室")),
            List.of(),
            TimeIntent.monthToDate(),
            ScopeIntent.AUTHORIZED,
            null,
            null
        );

        String mockResponse = """
            {
              "intent": "METRIC_SUMMARY",
              "metrics": [{"text": "有效药品医嘱条数"}],
              "dimensions": [{"text": "科室"}],
              "period": {"type": "LAST_30_DAYS"},
              "scope": "AUTHORIZED"
            }
            """;
        when(ai.complete(anyString(), anyString())).thenReturn(mockResponse);

        List<AnalysisPage.Turn> history = List.of(
            new AnalysisPage.Turn(AnalysisPage.Speaker.USER, "查看各科室有效药品医嘱"),
            new AnalysisPage.Turn(AnalysisPage.Speaker.ASSISTANT, "已生成各科室有效药品医嘱分析")
        );

        SemanticQuery updated = interpreter.interpret(
            "改成最近30天",
            base,
            history,
            LocalDate.of(2026, 9, 17)
        );

        assertNotNull(updated);
        assertEquals("LAST_30_DAYS", updated.period().type());
        assertEquals("有效药品医嘱条数", updated.metrics().get(0).text());
        assertEquals("科室", updated.dimensions().get(0).text());
        assertEquals(ScopeIntent.AUTHORIZED, updated.scope());
    }

    @Test
    @DisplayName("系统 Prompt 边界约束校验：绝不泄露或指示数据库物理实现")
    void system_prompt_strictly_prohibits_database_and_sql_concepts() {
        String prompt = AnalysisIntentInterpreter.SYSTEM_PROMPT;

        // 验证 Prompt 强调纯业务语义
        assertTrue(prompt.contains("纯业务语义查询结构"));
        assertTrue(prompt.contains("你只负责自然语言理解"));
        assertTrue(prompt.contains("绝不要输出或猜测"));

        // Prompt 中禁止要求大模型决定物理概念
        assertFalse(prompt.contains("sourceCatalog"), "新 Prompt 不应包含 sourceCatalog");
        assertFalse(prompt.contains("orderKind"), "新 Prompt 不应包含物理字段 orderKind");
        assertFalse(prompt.contains("orderStatus"), "新 Prompt 不应包含物理字段 orderStatus");
        assertFalse(prompt.contains("measures"), "新 Prompt 不应包含 measures 数组");
    }

    @Test
    @DisplayName("Feature Flag 禁用时抛出安全异常")
    void disabled_interpreter_throws_forbidden() {
        AnalysisIntentInterpreter disabled = new AnalysisIntentInterpreter(ai, json, false);
        assertThrows(BusinessException.class, () ->
            disabled.interpret("本月挂号人次", null, List.of(), LocalDate.now())
        );
    }
}
