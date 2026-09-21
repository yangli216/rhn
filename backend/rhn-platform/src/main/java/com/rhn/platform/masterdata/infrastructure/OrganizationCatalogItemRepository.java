package com.rhn.platform.masterdata.infrastructure;

import com.rhn.platform.masterdata.domain.OrganizationCatalogItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;

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

    @Query("""
            select distinct new com.rhn.platform.masterdata.infrastructure.OrganizationCatalogItemKey(
                a.tenantId, a.organizationId, a.catalogItemId)
            from OrganizationCatalogItem a
            order by a.tenantId, a.organizationId, a.catalogItemId
            """)
    List<OrganizationCatalogItemKey> findDistinctSearchProjectionKeys(Pageable pageable);

    @Query("""
            select distinct new com.rhn.platform.masterdata.infrastructure.OrganizationCatalogItemKey(
                a.tenantId, a.organizationId, a.catalogItemId)
            from OrganizationCatalogItem a
            where a.validFrom = :effectiveFrom or a.validTo = :effectiveTo
            order by a.tenantId, a.organizationId, a.catalogItemId
            """)
    List<OrganizationCatalogItemKey> findSearchProjectionTransitionKeys(
            @org.springframework.data.repository.query.Param("effectiveFrom") java.time.LocalDate effectiveFrom,
            @org.springframework.data.repository.query.Param("effectiveTo") java.time.LocalDate effectiveTo,
            Pageable pageable);
}
