package com.rhn.platform.organization.api;

import java.time.LocalDate;
import java.util.List;

/** Public organization contract available to business modules. */
public interface OrganizationDirectory {
    TenantView requireTenant(Long tenantId);
    OrganizationView requireOrganization(Long tenantId, Long organizationId);
    /** Legal organizations only; organization units and departments are not independent tenant data scopes. */
    List<OrganizationView> listOrganizationUnits(Long tenantId);
    Long catalogSourceOrganizationId(Long tenantId, Long organizationId);
    DepartmentView requireDepartment(Long tenantId, Long organizationId, Long departmentId);
    List<DepartmentView> listDepartments(Long tenantId, Long organizationId);
    StaffDetailView requireStaff(Long tenantId, Long practitionerId);
    List<StaffView> listStaff(Long tenantId);
    /** Practitioners with an active employment and assignment in the organization on a position of the given type on that date. */
    List<PositionStaffRef> activeStaffByPositionType(Long tenantId, Long organizationId, String positionType, LocalDate onDate);
    List<OrganizationView> organizationLineage(Long tenantId, Long organizationId);
    List<DepartmentView> departmentLineage(Long tenantId, Long organizationId, Long departmentId);
}
