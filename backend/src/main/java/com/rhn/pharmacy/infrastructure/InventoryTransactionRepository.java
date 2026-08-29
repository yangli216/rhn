package com.rhn.pharmacy.infrastructure;

import com.rhn.pharmacy.domain.InventoryTransaction;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface InventoryTransactionRepository extends JpaRepository<InventoryTransaction, Long> {
    Optional<InventoryTransaction> findByTenantIdAndRequestCode(Long tenantId, String requestCode);
    List<InventoryTransaction> findByTenantIdAndInventoryPeriodIdOrderByPostedAtDesc(Long tenantId, Long periodId);
}
