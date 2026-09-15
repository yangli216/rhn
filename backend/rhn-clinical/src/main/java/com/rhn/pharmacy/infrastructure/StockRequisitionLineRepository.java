package com.rhn.pharmacy.infrastructure;

import com.rhn.pharmacy.domain.StockRequisitionLine;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface StockRequisitionLineRepository extends JpaRepository<StockRequisitionLine, Long> {
    List<StockRequisitionLine> findByTenantIdAndStockRequisitionIdOrderBySortOrder(Long tenantId, Long requisitionId);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select value from StockRequisitionLine value where value.tenantId = :tenantId " +
            "and value.stockRequisitionId = :requisitionId order by value.sortOrder")
    List<StockRequisitionLine> lockByRequisition(@Param("tenantId") Long tenantId,
                                                 @Param("requisitionId") Long requisitionId);
}
