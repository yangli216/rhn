package com.rhn.pharmacy.infrastructure;

import com.rhn.pharmacy.domain.StockReturnLine;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface StockReturnLineRepository extends JpaRepository<StockReturnLine, Long> {
    List<StockReturnLine> findByTenantIdAndStockReturnIdOrderBySortOrder(Long tenantId, Long stockReturnId);
}
