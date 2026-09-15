package com.rhn.pharmacy.infrastructure;
import com.rhn.pharmacy.domain.StockTransferLine;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
public interface StockTransferLineRepository extends JpaRepository<StockTransferLine, Long> {
    List<StockTransferLine> findByTenantIdAndStockTransferIdOrderBySortOrder(Long tenantId, Long transferId);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select value from StockTransferLine value where value.tenantId=:tenantId and value.stockTransferId=:transferId order by value.sortOrder")
    List<StockTransferLine> lockByTransfer(@Param("tenantId") Long tenantId, @Param("transferId") Long transferId);
}
