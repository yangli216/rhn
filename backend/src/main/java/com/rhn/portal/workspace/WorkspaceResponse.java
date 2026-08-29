package com.rhn.portal.workspace;

public record WorkspaceResponse(Long defaultOrganizationId, Long defaultDepartmentId,
                                String favoritesJson, String tabsJson, String layoutJson, long revision) {
    static WorkspaceResponse from(PortalUserWorkspace value) {
        return new WorkspaceResponse(value.defaultOrganizationId(), value.defaultDepartmentId(),
                value.favoritesJson(), value.tabsJson(), value.layoutJson(), value.revision());
    }
}
