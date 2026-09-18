package com.rhn.analytics.semantic.interpreter;

import com.rhn.ai.api.StructuredAiDirectory;
import com.rhn.analytics.api.AnalysisPage;
import com.rhn.analytics.semantic.model.*;
import com.rhn.shared.json.JsonCodec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.*;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.forbidden;

@Service
public class AnalysisIntentInterpreter {
    public static final String SYSTEM_PROMPT = """
        你负责将用户的统计分析需求转换为纯业务语义查询结构。
        你只负责自然语言理解与业务意图抽取，不知道也不决定数据库结构。
        绝不要输出或猜测：数据表、物理列名、数据来源、关联连接、SUM/AVG/COUNT等聚合算子、SQL。

        请从用户输入中提取以下业务语义结构：
        1. metrics: 用户想查看的业务指标名称列表，每一项为 {"text": "指标名称"}。例如："药品费用"、"门诊挂号数"、"患者人数"、"确诊记录数"。当指标含义含糊（如单说“收入”、“费用情况”）时，保留用户原始提问文本，绝不要猜测底层实现。
        2. dimensions: 用户想使用的统计维度列表，每一项为 {"text": "维度名称"}。例如："科室"、"按日"、"按月"、"医嘱类别"、"项目"、"诊断"。
        3. period: 统计周期。支持 type:
           - MONTH_TO_DATE (本月，默认)
           - LAST_MONTH (上月/上个月)
           - LAST_30_DAYS (近30天/最近30天)
           - YEAR_TO_DATE (今年/年初至今)
           - FIXED (具体起止日期，提供 startDate 与 endDate，格式 yyyy-MM-dd)
        4. scope: 统计范围。
           - AUTHORIZED: 提及“各科室”、“所有科室”、“全部科室”、“全院”、“科室对比”等多科室范围；
           - CURRENT: 仅查看当前科室（默认）。
        5. sort: 排序意图 {"metric": "指标文本", "direction": "DESC"或"ASC"}。
        6. limit: 排行数量限制整数（默认10）。
        7. intent: 分析意图。
           - RANKING: 明确提及排行、排行榜、从高到低排序等；
           - TREND: 明确提及趋势、按日/按月走势、随时间变化等；
           - DISTRIBUTION: 明确提及构成、分布、占比分类等；
           - COMPARISON: 明确提及对比、比较等；
           - METRIC_SUMMARY: 常规指标统计汇总。
        8. filters: 显式业务筛选条件 [{"dimension": "维度名称", "operator": "EQ|IN|CONTAINS|GTE|LTE", "values": ["筛选值"]}]。

        多轮对话规则：
        若提供 currentQuery，当前为修改已有查询。保留未要求变更的维度、指标、周期和范围；仅根据本轮最新需求更新用户要求调整的部分（例如“改成最近30天”仅更新 period）。

        只返回合法 JSON，格式示例：
        {"intent":"RANKING","metrics":[{"text":"药品费用"}],"dimensions":[{"text":"科室"}],"period":{"type":"MONTH_TO_DATE"},"scope":"AUTHORIZED","sort":{"metric":"药品费用","direction":"DESC"},"limit":10}
        """;

    private final StructuredAiDirectory ai;
    private final JsonCodec json;
    private final boolean enabled;

    public AnalysisIntentInterpreter(
        StructuredAiDirectory ai,
        JsonCodec json,
        @Value("${rhn.analytics.semantic-v2-enabled:true}") boolean enabled
    ) {
        this.ai = ai;
        this.json = json;
        this.enabled = enabled;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public record InterpretRequest(
        String requirement,
        SemanticQuery currentQuery,
        List<AnalysisPage.Turn> history,
        LocalDate today
    ) {}

    public SemanticQuery interpret(InterpretRequest request) {
        if (!enabled) {
            throw forbidden("ANALYTICS_V2_DISABLED", "统计分析 V2 尚未开放");
        }
        if (request.requirement() == null || request.requirement().isBlank()) {
            throw badRequest("SEMANTIC_QUERY_INVALID", "统计需求不能为空");
        }

        Map<String, Object> input = new LinkedHashMap<>();
        input.put("requirement", request.requirement());
        input.put("currentQuery", request.currentQuery());
        input.put("history", request.history() == null ? List.of() : request.history());
        input.put("today", request.today() == null ? LocalDate.now() : request.today());

        try {
            String output = ai.complete(SYSTEM_PROMPT, json.write(input));
            return parseResponse(output, request.requirement());
        } catch (Exception e) {
            SemanticQuery fallback = fallbackHeuristic(request.requirement());
            if (fallback != null) {
                return fallback;
            }
            throw badRequest("SEMANTIC_AI_FAILED", "AI 意图解析服务暂不可用: " + e.getMessage());
        }
    }

    private SemanticQuery fallbackHeuristic(String text) {
        if (text == null || text.isBlank()) return null;

        List<MetricIntent> metrics = new ArrayList<>();
        List<DimensionIntent> dimensions = new ArrayList<>();
        List<FilterIntent> filters = new ArrayList<>();

        if (text.contains("药品费用") || text.contains("药品") || text.contains("药费")) {
            metrics.add(new MetricIntent("药品费用"));
        } else if (text.contains("挂号人次") || text.contains("挂号数") || text.contains("就诊人次")) {
            metrics.add(new MetricIntent("门诊挂号数"));
        } else if (text.contains("门诊收入") || text.contains("总收入") || text.contains("收入")) {
            metrics.add(new MetricIntent("门诊收入"));
        }

        if (text.contains("科室") || text.contains("部门")) {
            dimensions.add(new DimensionIntent("科室"));
        }

        if (text.contains("诊疗科室") || text.contains("临床科室")) {
            filters.add(new FilterIntent("dept_type", "IN", List.of("CLINICAL")));
        } else if (text.contains("库房") || text.contains("药房")) {
            filters.add(new FilterIntent("dept_type", "IN", List.of("PHARMACY")));
        }

        if (text.contains("高血压")) {
            filters.add(new FilterIntent("diagnosis", "CONTAINS", List.of("高血压")));
        }

        if (metrics.isEmpty()) return null;

        ScopeIntent scope = (text.contains("各科室") || text.contains("所有科室") || text.contains("全院") || text.contains("全机构"))
            ? ScopeIntent.AUTHORIZED
            : ScopeIntent.CURRENT;

        TimeIntent period = text.contains("上月") ? TimeIntent.lastMonth() : TimeIntent.monthToDate();

        return new SemanticQuery(
            AnalysisIntent.METRIC_SUMMARY,
            metrics,
            dimensions,
            filters,
            period,
            scope,
            null,
            20
        );
    }

    public SemanticQuery interpret(String requirement, SemanticQuery currentQuery, List<AnalysisPage.Turn> history, LocalDate today) {
        return interpret(new InterpretRequest(requirement, currentQuery, history, today));
    }

    public SemanticQuery parseResponse(String output, String rawRequirement) {
        if (output == null || output.isBlank()) {
            throw badRequest("SEMANTIC_AI_INVALID", "AI 未能返回语义分析结果");
        }
        try {
            SemanticQuery query = json.read(output, SemanticQuery.class);
            if (query == null) {
                throw badRequest("SEMANTIC_AI_INVALID", "AI 返回的语义格式无效");
            }
            // 补全默认值保护
            AnalysisIntent intent = query.intent() == null ? AnalysisIntent.METRIC_SUMMARY : query.intent();
            TimeIntent period = query.period() == null ? TimeIntent.monthToDate() : query.period();
            ScopeIntent scope = query.scope() == null ? ScopeIntent.CURRENT : query.scope();
            // 自动侦测各科室/全院关键词进行 scope 兜底增强
            if (rawRequirement != null && rawRequirement.matches("(?s).*(各科室|所有科室|全部科室|全院|科室对比).*")) {
                scope = ScopeIntent.AUTHORIZED;
            }
            return new SemanticQuery(intent, query.metrics(), query.dimensions(), query.filters(), period, scope, query.sort(), query.limit());
        } catch (RuntimeException e) {
            throw badRequest("SEMANTIC_AI_INVALID", "AI 返回的语义格式无效，请重试: " + e.getMessage());
        }
    }
}
