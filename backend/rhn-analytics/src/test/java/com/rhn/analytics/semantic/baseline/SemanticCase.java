package com.rhn.analytics.semantic.baseline;

import java.util.List;
import java.util.Map;

public record SemanticCase(
    String id,
    String category,
    String question,
    String description,
    Expected expected
) {
    public enum Status { READY, CLARIFY, UNSUPPORTED }

    public record Expected(
        Status status,
        String intent,
        List<String> metrics,
        List<String> dimensions,
        Period period,
        String scope,
        Sort sort,
        List<Filter> filters,
        String clarificationCode,
        String clarificationMessage,
        List<CandidateOption> candidateOptions,
        String unsupportedReason,
        String missingCapability
    ) {}

    public record Period(
        String type,
        String startDate,
        String endDate
    ) {}

    public record Sort(
        String metric,
        String direction
    ) {}

    public record Filter(
        String dimension,
        String operator,
        String value
    ) {}

    public record CandidateOption(
        String code,
        String label
    ) {}
}
