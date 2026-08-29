package com.rhn.platform.configuration.api;

import tools.jackson.databind.JsonNode;


public record ConfigurationValue(
        String key,
        JsonNode value,
        String valueType,
        String category,
        boolean inheritanceEnabled,
        boolean cacheEnabled,
        String requestedScope,
        Long requestedScopeId,
        String requestedScopeCode,
        String resolvedScope,
        Long resolvedScopeId,
        String resolvedScopeCode,
        String valueMode,
        boolean inherited,
        Long revision,
        String secretReference
) {
    public ConfigurationValue {
        value = value == null ? null : value.deepCopy();
    }

    @Override
    public JsonNode value() {
        return value == null ? null : value.deepCopy();
    }
}
