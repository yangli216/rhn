package com.rhn.platform.configuration.api;

import com.rhn.platform.configuration.domain.ConfigurationCategory;
import com.rhn.platform.configuration.domain.ConfigurationControlType;
import com.rhn.platform.configuration.domain.ConfigurationDisplayPolicy;
import com.rhn.platform.configuration.domain.ConfigurationScope;
import com.rhn.platform.configuration.domain.ConfigurationSensitivity;
import com.rhn.platform.configuration.domain.ConfigurationStatus;
import com.rhn.platform.configuration.domain.ConfigurationValueType;

import java.time.Instant;
import java.util.List;
import java.util.Set;

public record ParameterDefinitionDetailResponse(
        Long id,
        long revision,
        Long categoryId,
        String categoryName,
        String key,
        String name,
        String description,
        ConfigurationValueType sdParamValueType,
        ConfigurationControlType sdParamControlType,
        String jsonSchema,
        String defaultValueJson,
        String exampleValueJson,
        boolean hasDefaultValue,
        boolean hasExampleValue,
        String unit,
        String dictionaryCode,
        Set<ConfigurationScope> allowedScopes,
        ConfigurationCategory sdParamConfigType,
        boolean inheritanceEnabled,
        boolean cacheEnabled,
        boolean nullableValue,
        ConfigurationSensitivity sdParamSensitivity,
        ConfigurationDisplayPolicy sdParamDisplayPolicy,
        ConfigurationStatus sdParamStatus,
        Instant createdAt,
        Long createdBy,
        Instant updatedAt,
        Long updatedBy,
        List<ParameterValueResponse> values
) {
}
