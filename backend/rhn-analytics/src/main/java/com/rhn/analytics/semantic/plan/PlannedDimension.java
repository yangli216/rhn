package com.rhn.analytics.semantic.plan;

/**
 * 逻辑查询计划中的分组维度。
 */
public record PlannedDimension(
    String dimensionCode,
    String name,
    String entity,
    String tableAlias,
    String column,
    String groupExpression
) {
    public PlannedDimension {
        if (dimensionCode == null || dimensionCode.isBlank()) throw new IllegalArgumentException("dimensionCode cannot be blank");
        if (name == null || name.isBlank()) throw new IllegalArgumentException("dimension name cannot be blank");
    }
}
