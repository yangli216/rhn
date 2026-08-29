package com.rhn.pharmacy.infrastructure;

import com.rhn.pharmacy.domain.InventoryBalance;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface InventoryBalanceRepository extends JpaRepository<InventoryBalance, Long> {
    Optional<InventoryBalance> findByIdAndTenantId(Long id, Long tenantId);
    List<InventoryBalance> findByTenantIdAndStockSiteIdOrderByStockBinIdAscStockItemIdAscStockLotIdAsc(
            Long tenantId, Long stockSiteId);
    List<InventoryBalance> findByTenantIdAndStockBinIdOrderByStockItemIdAscStockLotIdAsc(
            Long tenantId, Long stockBinId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select b from InventoryBalance b where b.id = :id and b.tenantId = :tenantId")
    Optional<InventoryBalance> lockByIdAndTenantId(@Param("id") Long id, @Param("tenantId") Long tenantId);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            select b from InventoryBalance b
            where b.tenantId = :tenantId and b.stockBinId = :binId and b.stockItemId = :itemId
              and b.stockLotId = :lotId and b.stockStatus = :stockStatus
            """)
    Optional<InventoryBalance> lockDimension(@Param("tenantId") Long tenantId, @Param("binId") Long binId,
                                             @Param("itemId") Long itemId, @Param("lotId") Long lotId,
                                             @Param("stockStatus") String stockStatus);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            select b from InventoryBalance b, StockLot l, StockBin n
            where b.tenantId = :tenantId and b.stockSiteId = :siteId and b.stockItemId = :itemId
              and b.stockStatus = 'AVAILABLE' and b.quantityAvailable > 0
              and l.id = b.stockLotId and l.tenantId = b.tenantId
              and l.qualityStatus = 'QUALIFIED' and l.status = 'ACTIVE'
              and (l.expiryDate is null or l.expiryDate >= :businessDate)
              and n.id = b.stockBinId and n.tenantId = b.tenantId and n.active = true and n.pickAllowed = true
            order by case when l.expiryDate is null then 1 else 0 end, l.expiryDate asc,
                     case when l.productionDate is null then 1 else 0 end, l.productionDate asc, l.id asc
            """)
    List<InventoryBalance> lockIssuableFefo(@Param("tenantId") Long tenantId, @Param("siteId") Long siteId,
                                            @Param("itemId") Long itemId,
                                            @Param("businessDate") LocalDate businessDate);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            select b from InventoryBalance b, StockLot l, StockBin n
            where b.tenantId = :tenantId and b.stockSiteId = :siteId and b.stockItemId = :itemId
              and b.stockStatus = 'AVAILABLE' and b.quantityAvailable > 0
              and l.id = b.stockLotId and l.tenantId = b.tenantId
              and l.qualityStatus = 'QUALIFIED' and l.status = 'ACTIVE'
              and (l.expiryDate is null or l.expiryDate >= :businessDate)
              and n.id = b.stockBinId and n.tenantId = b.tenantId and n.active = true and n.pickAllowed = true
            order by case when l.productionDate is null then 1 else 0 end, l.productionDate asc, l.createdAt asc, l.id asc
            """)
    List<InventoryBalance> lockIssuableFifo(@Param("tenantId") Long tenantId, @Param("siteId") Long siteId,
                                            @Param("itemId") Long itemId,
                                            @Param("businessDate") LocalDate businessDate);

    List<InventoryBalance> findByTenantIdAndStockSiteIdAndStockItemIdOrderByProjectedAtDesc(
            Long tenantId, Long stockSiteId, Long stockItemId);
}
