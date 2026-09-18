package com.rhn.analytics.semantic.resolver;

import java.util.List;

public record Clarification(
    String code,
    String message,
    List<ClarificationOption> options
) {
    public Clarification {
        if (code == null || code.isBlank()) throw new IllegalArgumentException("Clarification code cannot be blank");
        if (message == null || message.isBlank()) throw new IllegalArgumentException("Clarification message cannot be blank");
        options = options == null ? List.of() : List.copyOf(options);
    }
}
