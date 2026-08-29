package com.rhn.platform.masterdata.infrastructure;

import com.rhn.platform.masterdata.domain.OrganizationCatalogItem;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface OrganizationCatalogItemRepository extends JpaRepository<OrganizationCatalogItem, Long> {
    List<OrganizationCatalogItem> findByTenantIdAndOrganizationIdAndCatalogItemIdIn(
            Long tenantId, Long organizationId, Collection<Long> catalogItemIds);
    Optional<OrganizationCatalogItem> findFirstByTenantIdAndOrganizationIdAndCatalogItemIdOrderByValidFromDesc(
            Long tenantId, Long organizationId, Long catalogItemId);
    List<OrganizationCatalogItem> findByTenantIdAndOrganizationIdAndCatalogItemIdOrderByValidFromDesc(
            Long tenantId, Long organizationId, Long catalogItemId);
    Optional<OrganizationCatalogItem> findByIdAndTenantId(Long id, Long tenantId);
}
