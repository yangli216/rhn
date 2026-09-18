package com.rhn.analytics.semantic.plan;

import java.time.LocalDate;

/**
 * 逻辑查询计划中的时间范围规划。
 */
public record PlannedTimeRange(
    String entity,
    String tableAlias,
    String column,
    String type,
    LocalDate startDate,
    LocalDate endDate
) {
    public PlannedTimeRange {
        if (column == null || column.isBlank()) throw new IllegalArgumentException("column cannot be blank");
        if (type == null || type.isBlank()) type = "MONTH_TO_DATE";
    }
}
