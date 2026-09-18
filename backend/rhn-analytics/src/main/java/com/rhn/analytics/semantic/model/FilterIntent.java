package com.rhn.analytics.semantic.model;

import java.util.List;

public record FilterIntent(
    String dimension,
    String operator,
    List<String> values
) {
    public FilterIntent {
        if (dimension == null || dimension.isBlank()) {
            throw new IllegalArgumentException("Filter dimension cannot be blank");
        }
        values = values == null ? List.of() : List.copyOf(values);
    }
}
