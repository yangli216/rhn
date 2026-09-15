package com.rhn.pharmacy.infrastructure;

import com.rhn.pharmacy.domain.StockReturn;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface StockReturnRepository extends JpaRepository<StockReturn, Long> {
    Optional<StockReturn> findByTenantIdAndReturnNo(Long tenantId, String returnNo);
    List<StockReturn> findByTenantIdAndOriginalDispenseIdOrderByRequestedAt(Long tenantId, Long originalDispenseId);
}
