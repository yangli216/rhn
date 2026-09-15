package com.rhn.platform.masterdata.infrastructure;

import com.rhn.platform.masterdata.domain.CatalogPrice;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface CatalogPriceRepository extends JpaRepository<CatalogPrice, Long> {
    List<CatalogPrice> findByTenantIdAndCatalogItemIdInOrderByValidFromDesc(
            Long tenantId, Collection<Long> catalogItemIds);
    List<CatalogPrice> findByTenantIdAndCatalogItemIdOrderByValidFromDesc(Long tenantId, Long catalogItemId);
    Optional<CatalogPrice> findByIdAndTenantId(Long id, Long tenantId);
}
