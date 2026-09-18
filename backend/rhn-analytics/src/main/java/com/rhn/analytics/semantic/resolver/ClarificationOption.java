package com.rhn.analytics.semantic.resolver;

public record ClarificationOption(
    String code,
    String label
) {
    public ClarificationOption {
        if (code == null || code.isBlank()) throw new IllegalArgumentException("Clarification option code cannot be blank");
        if (label == null || label.isBlank()) throw new IllegalArgumentException("Clarification option label cannot be blank");
    }
}
