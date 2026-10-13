package com.rhn.platform.maintenance.api;

import java.util.List;

public record MaintenanceWorkspace(Long tenantId, String tenantName, String environmentName,
                                   boolean physicalCleanupEnabled, List<OrganizationOption> organizations) {
    @io.swagger.v3.oas.annotations.media.Schema(name = "MaintenanceOrganizationOption")
    public record OrganizationOption(Long id, String name, String lifecycle) {}
}
