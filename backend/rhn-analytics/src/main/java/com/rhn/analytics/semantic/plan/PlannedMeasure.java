package com.rhn.analytics.semantic.plan;

import com.rhn.analytics.semantic.model.Aggregate;

import java.util.List;

/**
 * 逻辑查询计划中的度量项。
 */
public record PlannedMeasure(
    String measureCode,
    String name,
    String entity,
    String tableAlias,
    String column,
    Aggregate aggregate,
    List<PlannedFilter> defaultFilters
) {
    public PlannedMeasure {
        if (measureCode == null || measureCode.isBlank()) throw new IllegalArgumentException("measureCode cannot be blank");
        if (name == null || name.isBlank()) throw new IllegalArgumentException("measure name cannot be blank");
        if (aggregate == null) throw new IllegalArgumentException("aggregate cannot be null");
        defaultFilters = defaultFilters == null ? List.of() : List.copyOf(defaultFilters);
    }
}
