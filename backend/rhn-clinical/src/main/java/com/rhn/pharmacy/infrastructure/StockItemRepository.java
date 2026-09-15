package com.rhn.pharmacy.infrastructure;

import com.rhn.pharmacy.domain.StockItem;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface StockItemRepository extends JpaRepository<StockItem, Long> {
    Optional<StockItem> findByIdAndTenantId(Long id, Long tenantId);
    Optional<StockItem> findByTenantIdAndStockSiteIdAndCatalogItemId(Long tenantId, Long stockSiteId, Long catalogItemId);
    List<StockItem> findByTenantIdAndStockSiteIdOrderById(Long tenantId, Long stockSiteId);
}
