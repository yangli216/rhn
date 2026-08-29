package com.rhn.shared.api;

import java.time.Instant;
import java.util.List;

public record ApiError(
        String code,
        String message,
        String correlationId,
        Instant timestamp,
        List<FieldViolation> violations
) {
    public record FieldViolation(String field, String message) {
    }
}

