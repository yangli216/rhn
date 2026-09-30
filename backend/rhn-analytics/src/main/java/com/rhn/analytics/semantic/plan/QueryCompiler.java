package com.rhn.analytics.semantic.plan;

import com.rhn.analytics.semantic.model.Aggregate;
import org.springframework.stereotype.Component;

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

        appendSelectClause(sql, plan, columns);
        appendFromClause(sql, plan);
        appendJoinClauses(sql, plan);
        appendWhereClause(sql, plan, parameters);
        appendGroupByClause(sql, plan);
        appendOrderByClause(sql, plan, columns);

        // FETCH FIRST 限制子句（ANSI / Oracle 12c+ 标准）
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

    /** SELECT 子句：维度列与度量列，同时登记输出列元数据。 */
    private void appendSelectClause(StringBuilder sql, LogicalQueryPlan plan, List<CompiledColumn> columns) {
        sql.append("SELECT\n");
        List<String> selectExpressions = new ArrayList<>();

        for (PlannedDimension dim : plan.dimensions()) {
            String dimAlias = "dim_" + dim.dimensionCode();
            selectExpressions.add("    " + dim.groupExpression() + " AS " + dimAlias);
            columns.add(new CompiledColumn(dim.dimensionCode(), dim.name(), dimAlias, CompiledColumn.ColumnType.DIMENSION));
        }

        for (PlannedMeasure m : plan.measures()) {
            String measureAlias = "m_" + m.measureCode();
            String aggExpr = buildAggregateExpression(m.aggregate(), m.tableAlias(), m.column());
            selectExpressions.add("    " + aggExpr + " AS " + measureAlias);
            columns.add(new CompiledColumn(m.measureCode(), m.name(), measureAlias, CompiledColumn.ColumnType.MEASURE));
        }

        sql.append(String.join(",\n", selectExpressions)).append("\n");
    }

    private void appendFromClause(StringBuilder sql, LogicalQueryPlan plan) {
        sql.append("FROM ").append(plan.primaryTable()).append(" ").append(plan.primaryAlias()).append("\n");
    }

    private void appendJoinClauses(StringBuilder sql, LogicalQueryPlan plan) {
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
    }

    /** WHERE 子句：时间范围窗口 + 谓词下推（多租户、组织、授权科室、指标默认过滤、维度属性过滤）。 */
    private void appendWhereClause(StringBuilder sql, LogicalQueryPlan plan, Map<String, Object> parameters) {
        List<String> whereClauses = new ArrayList<>();
        appendTimeRangeClause(whereClauses, plan, parameters);
        appendFilterClauses(whereClauses, plan, parameters);

        if (!whereClauses.isEmpty()) {
            sql.append("WHERE ").append(String.join("\n  AND ", whereClauses)).append("\n");
        }
    }

    /** 时间范围窗口使用半开区间，保证微秒精度与索引命中。 */
    private void appendTimeRangeClause(List<String> whereClauses, LogicalQueryPlan plan, Map<String, Object> parameters) {
        if (plan.timeRange() == null) return;

        String timeCol = plan.timeRange().tableAlias() + "." + plan.timeRange().column();
        String startParam = "p_time_start";
        String endParam = "p_time_end";

        parameters.put(startParam, plan.timeRange().startDate().atStartOfDay());
        parameters.put(endParam, plan.timeRange().endDate().plusDays(1).atStartOfDay());

        whereClauses.add(timeCol + " >= :" + startParam + " AND " + timeCol + " < :" + endParam);
    }

    private void appendFilterClauses(List<String> whereClauses, LogicalQueryPlan plan, Map<String, Object> parameters) {
        int filterIndex = 0;
        for (PlannedFilter filter : plan.filters()) {
            String paramName = "p_f" + (filterIndex++) + "_" + filter.column().toLowerCase(Locale.ROOT);
            String columnExpr = filter.tableAlias() + "." + filter.column();

            switch (filter.operator()) {
                case EQ -> {
                    parameters.put(paramName, parseValue(filter.column(), firstValue(filter)));
                    whereClauses.add(columnExpr + " = :" + paramName);
                }
                case NE -> {
                    parameters.put(paramName, parseValue(filter.column(), firstValue(filter)));
                    whereClauses.add(columnExpr + " <> :" + paramName);
                }
                case IN -> {
                    parameters.put(paramName, parsedValues(filter));
                    whereClauses.add(columnExpr + " IN (:" + paramName + ")");
                }
                case NOT_IN -> {
                    parameters.put(paramName, parsedValues(filter));
                    whereClauses.add(columnExpr + " NOT IN (:" + paramName + ")");
                }
                case GTE -> {
                    parameters.put(paramName, parseValue(filter.column(), firstValue(filter)));
                    whereClauses.add(columnExpr + " >= :" + paramName);
                }
                case LTE -> {
                    parameters.put(paramName, parseValue(filter.column(), firstValue(filter)));
                    whereClauses.add(columnExpr + " <= :" + paramName);
                }
                case CONTAINS -> {
                    parameters.put(paramName, "%" + firstValue(filter) + "%");
                    whereClauses.add(columnExpr + " LIKE :" + paramName);
                }
            }
        }
    }

    private static String firstValue(PlannedFilter filter) {
        return filter.values().isEmpty() ? "" : filter.values().get(0);
    }

    private List<Object> parsedValues(PlannedFilter filter) {
        return filter.values().stream()
            .map(v -> parseValue(filter.column(), v))
            .collect(Collectors.toList());
    }

    private void appendGroupByClause(StringBuilder sql, LogicalQueryPlan plan) {
        if (plan.dimensions().isEmpty()) return;

        List<String> groupByExprs = plan.dimensions().stream()
            .map(PlannedDimension::groupExpression)
            .toList();
        sql.append("GROUP BY ").append(String.join(", ", groupByExprs)).append("\n");
    }

    private void appendOrderByClause(StringBuilder sql, LogicalQueryPlan plan, List<CompiledColumn> columns) {
        if (plan.sort() == null) return;

        String direction = plan.sort().direction() != null
            ? plan.sort().direction().toUpperCase(Locale.ROOT) : "DESC";
        sql.append("ORDER BY ")
           .append(resolveSortAlias(plan.sort().target(), columns))
           .append(" ").append(direction).append("\n");
    }

    /** 智能将指标/维度代码解析为其生成的别名。 */
    private static String resolveSortAlias(String sortTarget, List<CompiledColumn> columns) {
        for (CompiledColumn col : columns) {
            if (col.code().equalsIgnoreCase(sortTarget)) {
                return col.alias();
            }
        }
        return sortTarget;
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
