package com.rhn.analytics.semantic.model;

public record DimensionIntent(
    String text
) {
    public DimensionIntent {
        if (text == null || text.isBlank()) {
            throw new IllegalArgumentException("Dimension intent text cannot be blank");
        }
    }
}
