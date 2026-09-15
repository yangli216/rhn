package com.rhn.pharmacy.infrastructure;

import com.rhn.pharmacy.domain.GoodsReceipt;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface GoodsReceiptRepository extends JpaRepository<GoodsReceipt, Long> {
    Optional<GoodsReceipt> findByTenantIdAndRequestCode(Long tenantId, String requestCode);
    List<GoodsReceipt> findByTenantIdAndStockSiteIdOrderByCreatedAtDesc(Long tenantId, Long stockSiteId);
    List<GoodsReceipt> findByTenantIdAndPurchaseOrderIdOrderByCreatedAt(Long tenantId, Long purchaseOrderId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select value from GoodsReceipt value where value.id = :id and value.tenantId = :tenantId")
    Optional<GoodsReceipt> lockByIdAndTenantId(@Param("id") Long id, @Param("tenantId") Long tenantId);
}
