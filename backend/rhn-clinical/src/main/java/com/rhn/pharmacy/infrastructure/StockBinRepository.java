package com.rhn.pharmacy.infrastructure;

import com.rhn.pharmacy.domain.StockBin;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface StockBinRepository extends JpaRepository<StockBin, Long> {
    Optional<StockBin> findByIdAndTenantId(Long id, Long tenantId);
    Optional<StockBin> findByTenantIdAndStockSiteIdAndCode(Long tenantId, Long stockSiteId, String code);
    List<StockBin> findByTenantIdAndStockSiteIdOrderBySortOrderAscCodeAsc(Long tenantId, Long stockSiteId);
}
