package com.rhn.platform.masterdata.infrastructure;

import com.rhn.platform.masterdata.domain.ServiceVariant;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface ServiceVariantRepository extends JpaRepository<ServiceVariant, Long> {
    List<ServiceVariant> findByTenantIdAndCatalogItemIdInOrderByCatalogItemIdAscSortOrderAsc(
            Long tenantId, Collection<Long> catalogItemIds);
    List<ServiceVariant> findByTenantIdAndCatalogItemIdOrderBySortOrderAsc(Long tenantId, Long catalogItemId);
    void deleteByTenantIdAndCatalogItemId(Long tenantId, Long catalogItemId);
    Optional<ServiceVariant> findByTenantIdAndId(Long tenantId, Long id);
    Optional<ServiceVariant> findByTenantIdAndCatalogItemIdAndId(Long tenantId, Long catalogItemId, Long id);
    boolean existsByTenantIdAndCatalogItemIdAndCode(Long tenantId, Long catalogItemId, String code);
}
