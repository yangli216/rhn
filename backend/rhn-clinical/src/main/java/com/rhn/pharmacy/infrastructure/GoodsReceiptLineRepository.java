package com.rhn.pharmacy.infrastructure;

import com.rhn.pharmacy.domain.GoodsReceiptLine;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface GoodsReceiptLineRepository extends JpaRepository<GoodsReceiptLine, Long> {
    List<GoodsReceiptLine> findByTenantIdAndGoodsReceiptIdOrderBySortOrder(Long tenantId, Long goodsReceiptId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select value from GoodsReceiptLine value where value.tenantId = :tenantId " +
            "and value.goodsReceiptId = :receiptId order by value.sortOrder")
    List<GoodsReceiptLine> lockByReceipt(@Param("tenantId") Long tenantId, @Param("receiptId") Long receiptId);
}
