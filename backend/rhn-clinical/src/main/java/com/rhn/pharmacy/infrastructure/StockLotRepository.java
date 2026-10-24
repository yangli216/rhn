package com.rhn.pharmacy.infrastructure;

import com.rhn.pharmacy.domain.StockLot;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface StockLotRepository extends JpaRepository<StockLot, Long> {
    Optional<StockLot> findByIdAndTenantId(Long id, Long tenantId);
    List<StockLot> findByTenantIdAndIdIn(Long tenantId, List<Long> ids);
    Optional<StockLot> findByTenantIdAndCatalogItemIdAndPackageIdAndLotNo(
            Long tenantId, Long catalogItemId, Long packageId, String lotNo);
    List<StockLot> findByTenantIdAndCatalogItemIdOrderByExpiryDateAscLotNoAsc(Long tenantId, Long catalogItemId);
}
