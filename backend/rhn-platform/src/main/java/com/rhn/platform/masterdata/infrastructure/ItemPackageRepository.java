package com.rhn.platform.masterdata.infrastructure;

import com.rhn.platform.masterdata.domain.ItemPackage;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface ItemPackageRepository extends JpaRepository<ItemPackage, Long> {
    List<ItemPackage> findByTenantIdAndCatalogItemIdInOrderByCatalogItemIdAscQuantityFactorAsc(
            Long tenantId, Collection<Long> catalogItemIds);
    Optional<ItemPackage> findByIdAndTenantId(Long id, Long tenantId);
}
