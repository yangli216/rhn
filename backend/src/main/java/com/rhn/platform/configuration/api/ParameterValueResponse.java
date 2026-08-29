package com.rhn.platform.configuration.api;

import com.rhn.platform.configuration.domain.ConfigurationScope;
import com.rhn.platform.configuration.domain.ConfigurationStatus;
import com.rhn.platform.configuration.domain.ConfigurationValueMode;

import java.time.Instant;

public record ParameterValueResponse(
        Long id,
        Long definitionId,
        long revision,
        Long tenantId,
        ConfigurationScope sdParamScopeType,
        Long scopeId,
        String scopeReference,
        String scopeCode,
        ConfigurationValueMode sdParamValueMode,
        String valueJson,
        String displayValue,
        boolean hasValue,
        boolean secretReference,
        ConfigurationStatus sdParamStatus,
        Instant updatedAt,
        Long updatedBy
) {
}
