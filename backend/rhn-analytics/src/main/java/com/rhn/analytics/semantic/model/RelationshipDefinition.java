package com.rhn.analytics.semantic.model;

import java.util.List;

public record RelationshipDefinition(
    String from,
    String to,
    Cardinality cardinality,
    List<JoinCondition> conditions,
    boolean aggregationSafe,
    boolean fanoutRisk
) {
    public RelationshipDefinition {
        if (from == null || from.isBlank()) throw new IllegalArgumentException("From entity cannot be blank");
        if (to == null || to.isBlank()) throw new IllegalArgumentException("To entity cannot be blank");
        conditions = conditions == null ? List.of() : List.copyOf(conditions);
    }
}
