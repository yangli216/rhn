package com.rhn.analytics.semantic.model;

import java.util.List;

public record SemanticQuery(
    AnalysisIntent intent,
    List<MetricIntent> metrics,
    List<DimensionIntent> dimensions,
    List<FilterIntent> filters,
    TimeIntent period,
    ScopeIntent scope,
    SortIntent sort,
    Integer limit
) {
    public SemanticQuery {
        intent = intent == null ? AnalysisIntent.METRIC_SUMMARY : intent;
        metrics = metrics == null ? List.of() : List.copyOf(metrics);
        dimensions = dimensions == null ? List.of() : List.copyOf(dimensions);
        filters = filters == null ? List.of() : List.copyOf(filters);
        scope = scope == null ? ScopeIntent.CURRENT : scope;
        period = period == null ? TimeIntent.monthToDate() : period;
    }
}
