package com.rhn.analytics.semantic.resolver;

import com.rhn.analytics.semantic.model.*;

import java.util.List;

public record ResolvedSemanticQuery(
    AnalysisIntent intent,
    List<ResolvedMetric> metrics,
    List<ResolvedDimension> dimensions,
    List<FilterIntent> filters,
    List<ResolvedFilter> resolvedFilters,
    TimeIntent period,
    ScopeIntent scope,
    SortIntent sort,
    Integer limit
) {
    public ResolvedSemanticQuery(
        AnalysisIntent intent,
        List<ResolvedMetric> metrics,
        List<ResolvedDimension> dimensions,
        List<FilterIntent> filters,
        TimeIntent period,
        ScopeIntent scope,
        SortIntent sort,
        Integer limit
    ) {
        this(intent, metrics, dimensions, filters, List.of(), period, scope, sort, limit);
    }

    public ResolvedSemanticQuery {
        intent = intent == null ? AnalysisIntent.METRIC_SUMMARY : intent;
        metrics = metrics == null ? List.of() : List.copyOf(metrics);
        dimensions = dimensions == null ? List.of() : List.copyOf(dimensions);
        filters = filters == null ? List.of() : List.copyOf(filters);
        resolvedFilters = resolvedFilters == null ? List.of() : List.copyOf(resolvedFilters);
        period = period == null ? TimeIntent.monthToDate() : period;
        scope = scope == null ? ScopeIntent.CURRENT : scope;
    }
}
