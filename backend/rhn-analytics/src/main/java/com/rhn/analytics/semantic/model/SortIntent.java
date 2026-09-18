package com.rhn.analytics.semantic.model;

public record SortIntent(
    String metric,
    String direction
) {
    public SortIntent {
        direction = (direction == null || direction.isBlank()) ? "DESC" : direction.toUpperCase();
    }

    public static SortIntent desc(String metric) {
        return new SortIntent(metric, "DESC");
    }

    public static SortIntent asc(String metric) {
        return new SortIntent(metric, "ASC");
    }
}
