package com.rhn.pharmacy.infrastructure;

import com.rhn.pharmacy.domain.StockRequisitionAllocation;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface StockRequisitionAllocationRepository extends JpaRepository<StockRequisitionAllocation, Long> {
    List<StockRequisitionAllocation> findByTenantIdAndStockRequisitionLineIdOrderByCreatedAt(
            Long tenantId, Long requisitionLineId);
}
