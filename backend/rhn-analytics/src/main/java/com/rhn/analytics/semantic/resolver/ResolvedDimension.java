package com.rhn.analytics.semantic.resolver;

import com.rhn.analytics.semantic.model.DimensionDefinition;

public record ResolvedDimension(
    DimensionDefinition definition,
    String semanticRole
) {
    public ResolvedDimension {
        if (definition == null) throw new IllegalArgumentException("Dimension definition cannot be null");
        semanticRole = (semanticRole == null || semanticRole.isBlank()) ? definition.code() : semanticRole;
    }
}
