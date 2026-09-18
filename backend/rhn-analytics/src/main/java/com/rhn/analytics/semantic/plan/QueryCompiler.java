package com.rhn.analytics.semantic.plan;

import com.rhn.analytics.semantic.model.Aggregate;
import com.rhn.analytics.semantic.model.Operator;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 逻辑查询计划物理执行编译器（QueryCompiler）。
 * 职责：
 * 1. 100% 确定性代码实现，将 LogicalQueryPlan 编译为参数化可执行 SQL；
 * 2. 严格杜绝 SQL 注入：所有过滤谓词、时间窗口均绑定为命名参数 (:p_...)；
 * 3. 规范化维度与度量列别名映射（如 dim_... 与 m_...）；
 * 4. 严格兼容 Oracle 12c+ 与 ANSI SQL 标准语法（FETCH FIRST ... ROWS ONLY）。
 */
@Component
public class QueryCompiler {

    public CompiledQuery compile(LogicalQueryPlan plan) {
        Objects.requireNonNull(plan, "LogicalQueryPlan cannot be null");

        Map<String, Object> parameters = new LinkedHashMap<>();
        List<CompiledColumn> columns = new ArrayList<>();

        StringBuilder sql = new StringBuilder();

        // 1. SELECT 子句构建
        sql.append("SELECT\n");
        List<String> selectExpressions = new ArrayList<>();

        // 1.1 维度列
        for (PlannedDimension dim : plan.dimensions()) {
            String dimAlias = "dim_" + dim.dimensionCode();
            selectExpressions.add("    " + dim.groupExpression() + " AS " + dimAlias);
            columns.add(new CompiledColumn(dim.dimensionCode(), dim.name(), dimAlias, CompiledColumn.ColumnType.DIMENSION));
        }

        // 1.2 度量列
        for (PlannedMeasure m : plan.measures()) {
            String measureAlias = "m_" + m.measureCode();
            String aggExpr = buildAggregateExpression(m.aggregate(), m.tableAlias(), m.column());
            selectExpressions.add("    " + aggExpr + " AS " + measureAlias);
            columns.add(new CompiledColumn(m.measureCode(), m.name(), measureAlias, CompiledColumn.ColumnType.MEASURE));
        }

        sql.append(String.join(",\n", selectExpressions)).append("\n");

        // 2. FROM 子句构建
        sql.append("FROM ").append(plan.primaryTable()).append(" ").append(plan.primaryAlias()).append("\n");

        // 3. JOIN 子句构建
        for (PlannedJoin join : plan.joins()) {
            String joinKeyword = join.joinType() == JoinType.INNER_JOIN ? "INNER JOIN" : "LEFT JOIN";
            sql.append(joinKeyword).append(" ")
               .append(join.toTable()).append(" ").append(join.toAlias())
               .append(" ON ");

            String fromAlias = join.fromAlias() != null ? join.fromAlias() : plan.primaryAlias();
            List<String> conditions = join.conditions().stream()
                .map(c -> fromAlias + "." + c.fromField() + " = " + join.toAlias() + "." + c.toField())
                .toList();

            sql.append(String.join(" AND ", conditions)).append("\n");
        }

        // 4. WHERE 子句构建（时间范围 + 谓词下推 + 安全范围）
        List<String> whereClauses = new ArrayList<>();

        // 4.1 时间范围窗口（半开区间，保证微秒精度与索引命中）
        if (plan.timeRange() != null) {
            String timeCol = plan.timeRange().tableAlias() + "." + plan.timeRange().column();
            String startParam = "p_time_start";
            String endParam = "p_time_end";

            LocalDateTime startTime = plan.timeRange().startDate().atStartOfDay();
            LocalDateTime endTime = plan.timeRange().endDate().plusDays(1).atStartOfDay();

            parameters.put(startParam, startTime);
            parameters.put(endParam, endTime);

            whereClauses.add(timeCol + " >= :" + startParam + " AND " + timeCol + " < :" + endParam);
        }

        // 4.2 过滤谓词（多租户、组织、授权科室、指标默认过滤、维度属性过滤）
        int filterIndex = 0;
        for (PlannedFilter filter : plan.filters()) {
            String paramName = "p_f" + (filterIndex++) + "_" + filter.column().toLowerCase(Locale.ROOT);
            String columnExpr = filter.tableAlias() + "." + filter.column();

            switch (filter.operator()) {
                case EQ -> {
                    String val = filter.values().isEmpty() ? "" : filter.values().get(0);
                    parameters.put(paramName, parseValue(filter.column(), val));
                    whereClauses.add(columnExpr + " = :" + paramName);
                }
                case NE -> {
                    String val = filter.values().isEmpty() ? "" : filter.values().get(0);
                    parameters.put(paramName, parseValue(filter.column(), val));
                    whereClauses.add(columnExpr + " <> :" + paramName);
                }
                case IN -> {
                    List<Object> parsedValues = filter.values().stream()
                        .map(v -> parseValue(filter.column(), v))
                        .collect(Collectors.toList());
                    parameters.put(paramName, parsedValues);
                    whereClauses.add(columnExpr + " IN (:" + paramName + ")");
                }
                case NOT_IN -> {
                    List<Object> parsedValues = filter.values().stream()
                        .map(v -> parseValue(filter.column(), v))
                        .collect(Collectors.toList());
                    parameters.put(paramName, parsedValues);
                    whereClauses.add(columnExpr + " NOT IN (:" + paramName + ")");
                }
                case GTE -> {
                    String val = filter.values().isEmpty() ? "" : filter.values().get(0);
                    parameters.put(paramName, parseValue(filter.column(), val));
                    whereClauses.add(columnExpr + " >= :" + paramName);
                }
                case LTE -> {
                    String val = filter.values().isEmpty() ? "" : filter.values().get(0);
                    parameters.put(paramName, parseValue(filter.column(), val));
                    whereClauses.add(columnExpr + " <= :" + paramName);
                }
                case CONTAINS -> {
                    String val = filter.values().isEmpty() ? "" : filter.values().get(0);
                    parameters.put(paramName, "%" + val + "%");
                    whereClauses.add(columnExpr + " LIKE :" + paramName);
                }
            }
        }

        if (!whereClauses.isEmpty()) {
            sql.append("WHERE ").append(String.join("\n  AND ", whereClauses)).append("\n");
        }

        // 5. GROUP BY 子句构建
        if (!plan.dimensions().isEmpty()) {
            List<String> groupByExprs = plan.dimensions().stream()
                .map(PlannedDimension::groupExpression)
                .toList();
            sql.append("GROUP BY ").append(String.join(", ", groupByExprs)).append("\n");
        }

        // 6. ORDER BY 子句构建
        if (plan.sort() != null) {
            String sortTarget = plan.sort().target();
            String direction = plan.sort().direction() != null ? plan.sort().direction().toUpperCase(Locale.ROOT) : "DESC";

            // 智能将指标/维度代码解析为其生成的别名
            String resolvedOrderBy = sortTarget;
            for (CompiledColumn col : columns) {
                if (col.code().equalsIgnoreCase(sortTarget)) {
                    resolvedOrderBy = col.alias();
                    break;
                }
            }
            sql.append("ORDER BY ").append(resolvedOrderBy).append(" ").append(direction).append("\n");
        }

        // 7. FETCH FIRST 限制子句（ANSI / Oracle 12c+ 标准）
        int limit = plan.limit() > 0 ? plan.limit() : 10;
        sql.append("FETCH FIRST ").append(limit).append(" ROWS ONLY");

        return new CompiledQuery(
            plan.planId(),
            sql.toString(),
            parameters,
            columns,
            plan.grain(),
            limit
        );
    }

    private String buildAggregateExpression(Aggregate agg, String alias, String column) {
        String colExpr = alias + "." + column;
        return switch (agg) {
            case SUM -> "SUM(" + colExpr + ")";
            case AVG -> "AVG(" + colExpr + ")";
            case COUNT -> "COUNT(" + colExpr + ")";
            case COUNT_DISTINCT -> "COUNT(DISTINCT " + colExpr + ")";
        };
    }

    private Object parseValue(String column, String value) {
        if (value == null) return null;
        if (column.toUpperCase(Locale.ROOT).startsWith("ID_")) {
            try {
                return Long.parseLong(value);
            } catch (NumberFormatException ignored) {
                return value;
            }
        }
        return value;
    }
}
