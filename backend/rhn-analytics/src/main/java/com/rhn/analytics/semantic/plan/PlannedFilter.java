package com.rhn.analytics.semantic.plan;

import com.rhn.analytics.semantic.model.Operator;

import java.util.List;

/**
 * 逻辑查询计划中的谓词过滤条件。
 */
public record PlannedFilter(
    String entity,
    String tableAlias,
    String column,
    Operator operator,
    List<String> values,
    String description,
    boolean isScopeFilter
) {
    public PlannedFilter {
        if (column == null || column.isBlank()) throw new IllegalArgumentException("column cannot be blank");
        if (operator == null) operator = Operator.EQ;
        values = values == null ? List.of() : List.copyOf(values);
    }
}
