package com.rhn.analytics.semantic.plan;

/**
 * 逻辑查询计划中的排序与排行规则。
 */
public record PlannedSort(
    String target,
    String direction
) {
    public PlannedSort {
        if (direction == null || direction.isBlank()) direction = "DESC";
    }
}
