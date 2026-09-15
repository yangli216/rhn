package com.rhn.platform.organization.infrastructure;

import com.rhn.platform.organization.domain.Department;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface DepartmentRepository extends JpaRepository<Department, Long> {
    Optional<Department> findByIdAndTenantId(Long id, Long tenantId);
    Optional<Department> findByTenantIdAndOrganizationIdAndCode(Long tenantId, Long organizationId, String code);
    List<Department> findByTenantIdOrderByOrganizationIdAscSortOrderAscCodeAsc(Long tenantId);
    List<Department> findByTenantIdAndOrganizationIdOrderBySortOrderAscCodeAsc(Long tenantId, Long organizationId);
}
