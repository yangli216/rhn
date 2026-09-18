package com.rhn.analytics.semantic.model;

import java.util.List;

public record DimensionDefinition(
    String code,
    String name,
    List<String> aliases,
    String entity,
    String field,
    String grain,
    List<String> compatibleMetrics,
    List<DimensionAttribute> attributes
) {
    public DimensionDefinition(
        String code,
        String name,
        List<String> aliases,
        String entity,
        String field,
        String grain,
        List<String> compatibleMetrics
    ) {
        this(code, name, aliases, entity, field, grain, compatibleMetrics, List.of());
    }

    public DimensionDefinition {
        if (code == null || code.isBlank()) throw new IllegalArgumentException("Dimension code cannot be blank");
        if (name == null || name.isBlank()) throw new IllegalArgumentException("Dimension name cannot be blank");
        aliases = aliases == null ? List.of() : List.copyOf(aliases);
        compatibleMetrics = compatibleMetrics == null ? List.of() : List.copyOf(compatibleMetrics);
        attributes = attributes == null ? List.of() : List.copyOf(attributes);
    }
}
