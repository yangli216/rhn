package com.rhn.pharmacy.infrastructure;

import com.rhn.pharmacy.domain.PurchaseOrder;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface PurchaseOrderRepository extends JpaRepository<PurchaseOrder, Long> {
    Optional<PurchaseOrder> findByIdAndTenantId(Long id, Long tenantId);
    Optional<PurchaseOrder> findByTenantIdAndRequestCode(Long tenantId, String requestCode);
    List<PurchaseOrder> findByTenantIdAndStockSiteIdOrderByCreatedAtDesc(Long tenantId, Long stockSiteId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select value from PurchaseOrder value where value.id = :id and value.tenantId = :tenantId")
    Optional<PurchaseOrder> lockByIdAndTenantId(@Param("id") Long id, @Param("tenantId") Long tenantId);
}
