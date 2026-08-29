package com.rhn.shared.context;

import java.util.Set;

public record ExecutionContext(
        Long tenantId,
        Long subjectId,
        String actor,
        String correlationId,
        Set<String> authorities,
        Long organizationId,
        Long departmentId,
        String dataScopeType,
        Set<Long> accessibleOrganizationIds,
        Set<Long> accessibleDepartmentIds,
        Long practitionerId
) {
    public ExecutionContext {
        authorities = authorities == null ? Set.of() : Set.copyOf(authorities);
        accessibleOrganizationIds = accessibleOrganizationIds == null ? Set.of() : Set.copyOf(accessibleOrganizationIds);
        accessibleDepartmentIds = accessibleDepartmentIds == null ? Set.of() : Set.copyOf(accessibleDepartmentIds);
    }

    public ExecutionContext(Long tenantId, Long subjectId, String actor, String correlationId,
                            Set<String> authorities) {
        this(tenantId, subjectId, actor, correlationId, authorities, null, null, null, Set.of(), Set.of(), null);
    }

    public ExecutionContext(Long tenantId, Long subjectId, String actor, String correlationId,
                            Set<String> authorities, Long organizationId, Long departmentId,
                            String dataScopeType, Set<Long> accessibleOrganizationIds,
                            Set<Long> accessibleDepartmentIds) {
        this(tenantId, subjectId, actor, correlationId, authorities, organizationId, departmentId,
                dataScopeType, accessibleOrganizationIds, accessibleDepartmentIds, null);
    }

    public boolean hasAuthority(String authority) {
        return authorities.contains(authority);
    }

    public boolean hasWorkContext() {
        return organizationId != null;
    }

    public boolean canAccessOrganization(Long value) {
        return value != null && (value.equals(organizationId) || accessibleOrganizationIds.contains(value));
    }

    public boolean canAccessDepartment(Long value) {
        return value != null && (value.equals(departmentId) || accessibleDepartmentIds.contains(value));
    }
}
