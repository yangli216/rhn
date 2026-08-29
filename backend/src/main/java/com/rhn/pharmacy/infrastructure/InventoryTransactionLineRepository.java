package com.rhn.pharmacy.infrastructure;

import com.rhn.pharmacy.domain.InventoryTransactionLine;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface InventoryTransactionLineRepository extends JpaRepository<InventoryTransactionLine, Long> {
    List<InventoryTransactionLine> findByTenantIdAndInventoryTransactionIdOrderBySortOrder(
            Long tenantId, Long inventoryTransactionId);
}
