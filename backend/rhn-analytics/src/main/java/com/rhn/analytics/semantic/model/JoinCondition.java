package com.rhn.analytics.semantic.model;

public record JoinCondition(
    String fromField,
    String toField
) {
    public static JoinCondition on(String fromField, String toField) {
        return new JoinCondition(fromField, toField);
    }
}
