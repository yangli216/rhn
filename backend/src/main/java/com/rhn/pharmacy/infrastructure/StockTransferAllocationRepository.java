package com.rhn.pharmacy.infrastructure;
import com.rhn.pharmacy.domain.StockTransferAllocation;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
public interface StockTransferAllocationRepository extends JpaRepository<StockTransferAllocation, Long> {
    List<StockTransferAllocation> findByTenantIdAndStockTransferLineIdOrderById(Long tenantId, Long transferLineId);
}
