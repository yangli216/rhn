package com.rhn.platform.organization.api;

import java.util.List;

/** Public organization contract available to business modules. */
public interface OrganizationDirectory {
    TenantView requireTenant(Long tenantId);
    OrganizationView requireOrganization(Long tenantId, Long organizationId);
    Long catalogSourceOrganizationId(Long tenantId, Long organizationId);
    DepartmentView requireDepartment(Long tenantId, Long organizationId, Long departmentId);
    StaffDetailView requireStaff(Long tenantId, Long practitionerId);
    List<StaffView> listStaff(Long tenantId);
    List<OrganizationView> organizationLineage(Long tenantId, Long organizationId);
    List<DepartmentView> departmentLineage(Long tenantId, Long organizationId, Long departmentId);
}
