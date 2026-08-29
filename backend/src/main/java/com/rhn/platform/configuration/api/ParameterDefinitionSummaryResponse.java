package com.rhn.platform.configuration.api;

import com.rhn.platform.configuration.domain.ConfigurationCategory;
import com.rhn.platform.configuration.domain.ConfigurationControlType;
import com.rhn.platform.configuration.domain.ConfigurationStatus;
import com.rhn.platform.configuration.domain.ConfigurationValueType;

import java.time.Instant;

public record ParameterDefinitionSummaryResponse(
        Long id,
        long revision,
        Long categoryId,
        String categoryName,
        String key,
        String name,
        String description,
        ConfigurationValueType sdParamValueType,
        ConfigurationControlType sdParamControlType,
        ConfigurationCategory sdParamConfigType,
        ConfigurationStatus sdParamStatus,
        long valueCount,
        Instant updatedAt,
        Long updatedBy
) {
}
