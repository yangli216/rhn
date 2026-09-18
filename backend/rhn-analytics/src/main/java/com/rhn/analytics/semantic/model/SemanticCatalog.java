package com.rhn.analytics.semantic.model;

import java.util.List;

public record SemanticCatalog(
    String version,
    String domain,
    List<EntityDefinition> entities,
    List<RelationshipDefinition> relationships,
    List<MetricDefinition> metrics,
    List<DimensionDefinition> dimensions
) {
    public SemanticCatalog {
        if (version == null || version.isBlank()) throw new IllegalArgumentException("Version cannot be blank");
        if (domain == null || domain.isBlank()) throw new IllegalArgumentException("Domain cannot be blank");
        entities = entities == null ? List.of() : List.copyOf(entities);
        relationships = relationships == null ? List.of() : List.copyOf(relationships);
        metrics = metrics == null ? List.of() : List.copyOf(metrics);
        dimensions = dimensions == null ? List.of() : List.copyOf(dimensions);
    }

    public java.util.Optional<MetricDefinition> findMetric(String code) {
        if (code == null) return java.util.Optional.empty();
        return metrics.stream().filter(m -> m.code().equalsIgnoreCase(code)).findFirst();
    }

    public java.util.Optional<DimensionDefinition> findDimension(String code) {
        if (code == null) return java.util.Optional.empty();
        return dimensions.stream().filter(d -> d.code().equalsIgnoreCase(code)).findFirst();
    }

    public java.util.Optional<EntityDefinition> findEntity(String code) {
        if (code == null) return java.util.Optional.empty();
        return entities.stream().filter(e -> e.code().equalsIgnoreCase(code)).findFirst();
    }
}
