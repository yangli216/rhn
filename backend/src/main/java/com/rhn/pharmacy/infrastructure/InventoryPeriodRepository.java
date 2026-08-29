package com.rhn.pharmacy.infrastructure;

import com.rhn.pharmacy.domain.InventoryPeriod;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface InventoryPeriodRepository extends JpaRepository<InventoryPeriod, Long> {
    Optional<InventoryPeriod> findByTenantIdAndStockSiteIdAndPeriodCode(Long tenantId, Long stockSiteId, String periodCode);
}
