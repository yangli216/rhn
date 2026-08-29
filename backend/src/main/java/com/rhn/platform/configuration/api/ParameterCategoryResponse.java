package com.rhn.platform.configuration.api;

import com.rhn.platform.configuration.domain.ConfigurationStatus;

import java.time.Instant;

public record ParameterCategoryResponse(
        Long id,
        long revision,
        Long parentId,
        String code,
        String name,
        String description,
        int sortOrder,
        ConfigurationStatus sdParamStatus,
        Instant updatedAt,
        Long updatedBy
) {
}
