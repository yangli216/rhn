package com.rhn.analytics.semantic.resolver;

import java.util.List;

public record Resolution(
    ResolutionStatus status,
    String message,
    ResolvedSemanticQuery query,
    Clarification clarification,
    String unsupportedReason
) {
    public static Resolution ready(String message, ResolvedSemanticQuery query) {
        return new Resolution(ResolutionStatus.READY, message, query, null, null);
    }

    public static Resolution clarify(String code, String message, List<ClarificationOption> options) {
        return new Resolution(
            ResolutionStatus.CLARIFY,
            message,
            null,
            new Clarification(code, message, options),
            null
        );
    }

    public static Resolution unsupported(String reason, String message) {
        return new Resolution(ResolutionStatus.UNSUPPORTED, message, null, null, reason);
    }
}
