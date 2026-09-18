package com.rhn.analytics.semantic.execution;

import com.rhn.analytics.semantic.plan.CompiledColumn;
import com.rhn.analytics.semantic.plan.CompiledQuery;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.*;

/**
 * 基于 JDBC / NamedParameterJdbcTemplate 的结构化物理执行引擎。
 * 职责：
 * 1. 在只读事务中安全执行参数化编译 SQL；
 * 2. 跨数据库方言结果集大小写兼容规整；
 * 3. 自动度量汇总（总计、平均值、行数等统计计算）；
 * 4. 纳秒/毫秒级性能计时与元数据封装。
 */
@Service
public class JdbcStructuredExecutionEngine implements StructuredExecutionEngine {

    private final NamedParameterJdbcTemplate jdbcTemplate;

    public JdbcStructuredExecutionEngine(NamedParameterJdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    @Transactional(readOnly = true)
    public ExecutionResult execute(CompiledQuery query) {
        Objects.requireNonNull(query, "CompiledQuery cannot be null");

        long startTime = System.currentTimeMillis();

        List<Map<String, Object>> rawRows = jdbcTemplate.queryForList(query.sql(), query.parameters());

        // 规整结果集列名（免疫 Oracle/H2/PostgreSQL 大小写差异）
        List<Map<String, Object>> normalizedRows = new ArrayList<>();
        Map<String, BigDecimal> measureTotals = new LinkedHashMap<>();
        Map<String, Integer> measureCounts = new LinkedHashMap<>();

        for (Map<String, Object> raw : rawRows) {
            Map<String, Object> row = new LinkedHashMap<>();
            for (CompiledColumn col : query.columns()) {
                Object value = findValueCaseInsensitive(raw, col.alias());
                row.put(col.alias(), value);

                if (col.type() == CompiledColumn.ColumnType.MEASURE && value instanceof Number num) {
                    BigDecimal bd = new BigDecimal(num.toString());
                    measureTotals.merge(col.alias(), bd, BigDecimal::add);
                    measureCounts.merge(col.alias(), 1, Integer::sum);
                }
            }
            normalizedRows.add(row);
        }

        long executionTimeMs = System.currentTimeMillis() - startTime;

        // 构建度量摘要汇总信息
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("rowCount", normalizedRows.size());
        summary.put("grain", query.grain());
        for (Map.Entry<String, BigDecimal> entry : measureTotals.entrySet()) {
            summary.put("total_" + entry.getKey(), entry.getValue());
            int count = measureCounts.getOrDefault(entry.getKey(), 1);
            if (count > 0) {
                summary.put("avg_" + entry.getKey(), entry.getValue().divide(BigDecimal.valueOf(count), 2, java.math.RoundingMode.HALF_UP));
            }
        }

        String explanation = "成功完成统计查询，共返回 " + normalizedRows.size() + " 行数据，耗时 " + executionTimeMs + " ms";

        return ExecutionResult.ready(
            query.planId(),
            explanation,
            query.columns(),
            normalizedRows,
            executionTimeMs,
            query.sql(),
            query.parameters(),
            summary
        );
    }

    private Object findValueCaseInsensitive(Map<String, Object> raw, String targetKey) {
        if (raw.containsKey(targetKey)) {
            return raw.get(targetKey);
        }
        for (Map.Entry<String, Object> entry : raw.entrySet()) {
            if (entry.getKey().equalsIgnoreCase(targetKey)) {
                return entry.getValue();
            }
        }
        return null;
    }
}
