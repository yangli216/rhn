package com.rhn.platform.configuration.api;

public interface ConfigurationDirectory {
    default ConfigurationValue resolveCurrent(Long tenantId, Long userId, Long organizationId,
                                              Long departmentId, String key) {
        return resolveCurrent(tenantId, userId, organizationId, departmentId,
                null, null, null, key);
    }

    ConfigurationValue resolveCurrent(Long tenantId, Long userId, Long organizationId,
                                      Long departmentId, String productCode, String moduleCode,
                                      String environmentCode, String key);
}
