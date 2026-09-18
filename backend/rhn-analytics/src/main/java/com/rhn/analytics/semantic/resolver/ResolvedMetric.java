package com.rhn.analytics.semantic.resolver;

import com.rhn.analytics.semantic.model.DefaultFilter;
import com.rhn.analytics.semantic.model.MetricDefinition;

import java.util.List;

public record ResolvedMetric(
    MetricDefinition definition,
    List<DefaultFilter> effectiveFilters
) {
    public ResolvedMetric {
        if (definition == null) throw new IllegalArgumentException("Metric definition cannot be null");
        effectiveFilters = effectiveFilters == null ? List.of() : List.copyOf(effectiveFilters);
    }
}
