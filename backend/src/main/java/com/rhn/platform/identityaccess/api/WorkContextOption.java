package com.rhn.platform.identityaccess.api;

import java.util.Set;

public record WorkContextOption(
        Long organizationId,
        String organizationName,
        Long departmentId,
        String departmentName,
        WorkContextType workContextType,
        String dataScopeType,
        Set<String> roleCodes
) {
    public WorkContextOption {
        roleCodes = roleCodes == null ? Set.of() : Set.copyOf(roleCodes);
    }
}
