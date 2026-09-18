package com.rhn.analytics.semantic.execution;

import com.rhn.analytics.semantic.plan.CompiledColumn;
import com.rhn.analytics.semantic.resolver.Clarification;
import com.rhn.analytics.semantic.resolver.ResolutionStatus;

import java.util.List;
import java.util.Map;

/**
 * 语义统计分析执行结果。
 * 承载就绪执行结果、澄清选项或不支持说明。
 */
public record ExecutionResult(
    String planId,
    ResolutionStatus status,
    String explanation,
    List<CompiledColumn> columns,
    List<Map<String, Object>> rows,
    int totalRows,
    long executionTimeMs,
    String compiledSql,
    Map<String, Object> parameters,
    Map<String, Object> summary,
    Clarification clarification
) {
    public ExecutionResult {
        columns = columns == null ? List.of() : List.copyOf(columns);
        rows = rows == null ? List.of() : List.copyOf(rows);
        parameters = parameters == null ? Map.of() : Map.copyOf(parameters);
        summary = summary == null ? Map.of() : Map.copyOf(summary);
    }

    public static ExecutionResult ready(
        String planId,
        String explanation,
        List<CompiledColumn> columns,
        List<Map<String, Object>> rows,
        long executionTimeMs,
        String compiledSql,
        Map<String, Object> parameters,
        Map<String, Object> summary
    ) {
        return new ExecutionResult(
            planId,
            ResolutionStatus.READY,
            explanation,
            columns,
            rows,
            rows.size(),
            executionTimeMs,
            compiledSql,
            parameters,
            summary,
            null
        );
    }

    public static ExecutionResult clarify(String explanation, Clarification clarification) {
        return new ExecutionResult(
            null,
            ResolutionStatus.CLARIFY,
            explanation,
            List.of(),
            List.of(),
            0,
            0L,
            null,
            Map.of(),
            Map.of(),
            clarification
        );
    }

    public static ExecutionResult unsupported(String explanation) {
        return new ExecutionResult(
            null,
            ResolutionStatus.UNSUPPORTED,
            explanation,
            List.of(),
            List.of(),
            0,
            0L,
            null,
            Map.of(),
            Map.of(),
            null
        );
    }
}
