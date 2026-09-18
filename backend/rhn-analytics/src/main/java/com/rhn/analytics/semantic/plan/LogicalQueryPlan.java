package com.rhn.analytics.semantic.plan;

import java.util.List;

/**
 * 逻辑查询计划（LogicalQueryPlan）。
 * 由确定性规划器 QueryPlanner 生成，与数据库方言及具体执行引擎解耦。
 * 完整表达：主事实表粒度、确定性多表连接拓扑、分组维度、统计度量、过滤下推、时间窗口与安全权限范围。
 */
public record LogicalQueryPlan(
    String planId,
    String primaryEntity,
    String primaryTable,
    String primaryAlias,
    String grain,
    List<PlannedJoin> joins,
    List<PlannedDimension> dimensions,
    List<PlannedMeasure> measures,
    List<PlannedFilter> filters,
    PlannedTimeRange timeRange,
    PlannedScope scope,
    PlannedSort sort,
    int limit
) {
    public LogicalQueryPlan {
        if (planId == null || planId.isBlank()) throw new IllegalArgumentException("planId cannot be blank");
        if (primaryEntity == null || primaryEntity.isBlank()) throw new IllegalArgumentException("primaryEntity cannot be blank");
        if (primaryTable == null || primaryTable.isBlank()) throw new IllegalArgumentException("primaryTable cannot be blank");
        if (primaryAlias == null || primaryAlias.isBlank()) primaryAlias = "t0";
        joins = joins == null ? List.of() : List.copyOf(joins);
        dimensions = dimensions == null ? List.of() : List.copyOf(dimensions);
        measures = measures == null ? List.of() : List.copyOf(measures);
        filters = filters == null ? List.of() : List.copyOf(filters);
        if (limit <= 0) limit = 10;
    }
}
