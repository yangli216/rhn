package com.rhn.analytics.semantic.model;

import java.util.List;

public record MetricDefinition(
    String code,
    String name,
    List<String> aliases,
    String description,
    String domain,
    String source,
    String field,
    Aggregate aggregate,
    String grain,
    List<DefaultFilter> defaultFilters,
    String timeDimension,
    List<String> supportedDimensions,
    List<String> forbiddenMeanings
) {
    public MetricDefinition {
        if (code == null || code.isBlank()) throw new IllegalArgumentException("Metric code cannot be blank");
        if (name == null || name.isBlank()) throw new IllegalArgumentException("Metric name cannot be blank");
        if (aggregate == null) throw new IllegalArgumentException("Aggregate cannot be null");
        aliases = aliases == null ? List.of() : List.copyOf(aliases);
        defaultFilters = defaultFilters == null ? List.of() : List.copyOf(defaultFilters);
        supportedDimensions = supportedDimensions == null ? List.of() : List.copyOf(supportedDimensions);
        forbiddenMeanings = forbiddenMeanings == null ? List.of() : List.copyOf(forbiddenMeanings);
    }
}
