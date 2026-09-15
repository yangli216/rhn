package com.rhn.pharmacy.infrastructure;

import com.rhn.pharmacy.domain.PurchaseOrderLine;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface PurchaseOrderLineRepository extends JpaRepository<PurchaseOrderLine, Long> {
    List<PurchaseOrderLine> findByTenantIdAndPurchaseOrderIdOrderBySortOrder(Long tenantId, Long purchaseOrderId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select value from PurchaseOrderLine value where value.tenantId = :tenantId " +
            "and value.purchaseOrderId = :purchaseOrderId order by value.sortOrder")
    List<PurchaseOrderLine> lockByPurchaseOrder(@Param("tenantId") Long tenantId,
                                                @Param("purchaseOrderId") Long purchaseOrderId);
}
