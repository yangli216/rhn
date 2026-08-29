package com.rhn.portal.workspace;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UpdateWorkspaceRequest(
        Long defaultOrganizationId,
        Long defaultDepartmentId,
        @NotBlank @Size(max = 20000) String favoritesJson,
        @NotBlank @Size(max = 50000) String tabsJson,
        @NotBlank @Size(max = 20000) String layoutJson
) {
}
