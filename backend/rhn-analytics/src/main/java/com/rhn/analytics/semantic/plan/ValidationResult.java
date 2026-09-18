package com.rhn.analytics.semantic.plan;

import java.util.List;

/**
 * 逻辑查询计划的校验结果。
 */
public record ValidationResult(
    boolean isValid,
    List<String> errors,
    List<String> warnings
) {
    public ValidationResult {
        errors = errors == null ? List.of() : List.copyOf(errors);
        warnings = warnings == null ? List.of() : List.copyOf(warnings);
    }

    public static ValidationResult success() {
        return new ValidationResult(true, List.of(), List.of());
    }

    public static ValidationResult success(List<String> warnings) {
        return new ValidationResult(true, List.of(), warnings);
    }

    public static ValidationResult failure(List<String> errors) {
        return new ValidationResult(false, errors, List.of());
    }

    public static ValidationResult failure(String error) {
        return new ValidationResult(false, List.of(error), List.of());
    }
}
