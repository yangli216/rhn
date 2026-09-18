package com.rhn.analytics.semantic.model;

public record MetricIntent(
    String text
) {
    public MetricIntent {
        if (text == null || text.isBlank()) {
            throw new IllegalArgumentException("Metric intent text cannot be blank");
        }
    }
}
