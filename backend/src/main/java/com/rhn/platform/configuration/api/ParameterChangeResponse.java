package com.rhn.platform.configuration.api;

import com.rhn.platform.configuration.domain.ConfigurationChangeTargetType;
import com.rhn.platform.configuration.domain.ConfigurationChangeType;
import tools.jackson.databind.JsonNode;

import java.time.Instant;

public record ParameterChangeResponse(
        Long id,
        Long definitionId,
        Long valueId,
        ConfigurationChangeTargetType sdParamChangeTargetType,
        ConfigurationChangeType sdParamChangeType,
        JsonNode before,
        JsonNode after,
        String reason,
        String requestCode,
        Instant changedAt,
        Long changedBy
) {
}
