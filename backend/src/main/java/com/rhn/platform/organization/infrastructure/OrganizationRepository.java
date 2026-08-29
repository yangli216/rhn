package com.rhn.platform.organization.infrastructure;

import com.rhn.platform.organization.domain.Organization;
import com.rhn.platform.organization.domain.OrganizationKind;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface OrganizationRepository extends JpaRepository<Organization, Long> {
    Optional<Organization> findByIdAndTenantId(Long id, Long tenantId);
    Optional<Organization> findByTenantIdAndCode(Long tenantId, String code);
    List<Organization> findByTenantIdOrderBySortOrderAscCodeAsc(Long tenantId);
    List<Organization> findByTenantIdAndOrganizationKindOrderByCode(Long tenantId, OrganizationKind kind);
    boolean existsByTenantIdAndParentId(Long tenantId, Long parentId);
}
