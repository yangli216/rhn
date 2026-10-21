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

    /**
     * Login account; practitioner fields are empty for accounts not linked to a personnel record. revision is the
     * expectedRevision for status changes and password resets.
     */
    public record UserView(Long id, String username, String status, long revision, Long practitionerId,
                           String practitionerCode, String practitionerName) {
    }

    /**
     * grantSource is MANUAL or DEPT_DEFAULT; staffAssignmentId is set only for department-default grants and
     * names the assignment whose end also ends the grant.
     */
    public record UserRoleAssignmentView(Long id, Long userId, String username, Long roleId, String roleCode,
                                         String roleName, Long organizationId, String organizationName,
                                         Long departmentId, String departmentName, String dataScopeType,
                                         Instant validFrom, Instant validTo, Long grantedBy, Instant createdAt,
                                         boolean effective, String grantSource, Long staffAssignmentId,
                                         Long practitionerId, String practitionerCode, String practitionerName) {
    }

    /** What the acting account may manage: the whole tenant, one organization or its current department. */
    public record ManagementScopeView(String scopeType, Long organizationId, String organizationName,
                                      Long departmentId, String departmentName) {
    }

    /** A practitioner's login account (null when none is opened) and the grants visible in the manager's scope. */
    public record PractitionerAccessView(Long practitionerId, UserView account,
                                         List<UserRoleAssignmentView> assignments, ManagementScopeView scope) {
        public PractitionerAccessView {
            assignments = assignments == null ? List.of() : List.copyOf(assignments);
        }
    }

    public record DepartmentDefaultRoleView(Long id, Long organizationId, Long departmentId, Long roleId,
                                            String roleCode, String roleName, String roleStatus, Instant createdAt) {
    }

    /**
     * A department's default roles. manageable tells whether the acting account may change them; grantedCount
     * counts grants just applied to current staff (0 on reads).
     */
    public record DepartmentDefaultRolesView(Long organizationId, Long departmentId, boolean manageable,
                                             List<DepartmentDefaultRoleView> roles, int grantedCount) {
        public DepartmentDefaultRolesView {
            roles = roles == null ? List.of() : List.copyOf(roles);
        }
    }
}
