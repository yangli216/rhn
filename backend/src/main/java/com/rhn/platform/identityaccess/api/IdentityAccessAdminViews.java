package com.rhn.platform.identityaccess.api;

import java.time.Instant;
import java.util.List;

public final class IdentityAccessAdminViews {
    private IdentityAccessAdminViews() {
    }

    public record RoleView(Long id, String code, String name, String roleType, String status,
                           long version, List<String> permissionCodes) {
        public RoleView {
            permissionCodes = permissionCodes == null ? List.of() : List.copyOf(permissionCodes);
        }
    }

    public record PermissionView(Long id, String code, String name, String resourceCode, String actionCode,
                                 String status, Long moduleId, String moduleCode, String moduleName,
                                 String routePath) {
    }

    public record UserView(Long id, String username, String status) {
    }

    public record UserRoleAssignmentView(Long id, Long userId, String username, Long roleId, String roleCode,
                                         String roleName, Long organizationId, String organizationName,
                                         Long departmentId, String departmentName, String dataScopeType,
                                         Instant validFrom, Instant validTo, Long grantedBy, Instant createdAt,
                                         boolean effective) {
    }
}
