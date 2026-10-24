package com.rhn.pharmacy.infrastructure;

import com.rhn.pharmacy.domain.InventoryBalance;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface InventoryBalanceRepository extends JpaRepository<InventoryBalance, Long> {
    Optional<InventoryBalance> findByIdAndTenantId(Long id, Long tenantId);
    List<InventoryBalance> findByTenantIdAndStockSiteIdOrderByStockBinIdAscStockItemIdAscStockLotIdAsc(
            Long tenantId, Long stockSiteId);
    Page<InventoryBalance> findByTenantIdAndStockSiteIdOrderByStockBinIdAscStockItemIdAscStockLotIdAsc(
            Long tenantId, Long stockSiteId, Pageable pageable);
    List<InventoryBalance> findByTenantIdAndStockBinIdOrderByStockItemIdAscStockLotIdAsc(
            Long tenantId, Long stockBinId);

    /** 药房检索按库存项汇总可用数量：避免把批次×库位明细整表载入内存再聚合。 */
    @Query("""
            select b.stockItemId as stockItemId, sum(b.quantityAvailable) as quantity
            from InventoryBalance b
            where b.tenantId = :tenantId and b.stockSiteId = :siteId
              and b.stockStatus = 'AVAILABLE' and b.quantityAvailable > 0
            group by b.stockItemId
            """)
    List<ItemAvailability> availableQuantitiesByStockItem(@Param("tenantId") Long tenantId,
                                                          @Param("siteId") Long siteId);

    interface ItemAvailability {
        Long getStockItemId();
        BigDecimal getQuantity();
    }

    /** 仓库库存页按库存项聚合批次×库位明细，前端不再整表拉取余额明细后再汇总。 */
    @Query("""
            select b.stockItemId as stockItemId,
                   sum(b.quantityOnHand) as quantityOnHand,
                   sum(b.quantityAvailable) as quantityAvailable,
                   sum(b.quantityReserved) as quantityReserved,
                   sum(b.quantityFrozen) as quantityFrozen,
                   count(case when b.quantityOnHand <> 0 then 1 end) as activeRows,
                   count(distinct case when b.quantityOnHand <> 0 then b.stockLotId end) as activeLots,
                   count(distinct case when b.quantityOnHand <> 0 then b.stockBinId end) as binCount,
                   count(distinct case when b.quantityOnHand <> 0
                       and l.expiryDate between :today and :expiryLimit then b.stockLotId end) as expiringLots,
                   min(case when b.quantityOnHand <> 0 then l.expiryDate end) as earliestExpiry,
                   max(b.projectedAt) as latestProjectedAt,
                   count(case when b.quantityOnHand <> 0 and b.averageUnitCost is not null
                       and b.averageUnitCost >= 0 then 1 end) as costedRows,
                   sum(case when b.quantityOnHand <> 0 and b.averageUnitCost is not null
                       and b.averageUnitCost >= 0 then b.quantityOnHand else 0 end) as costedQuantity,
                   sum(case when b.quantityOnHand <> 0 and b.averageUnitCost is not null
                       and b.averageUnitCost >= 0 then b.quantityOnHand * b.averageUnitCost else 0 end) as costedAmount
            from InventoryBalance b
            left join StockLot l on l.id = b.stockLotId and l.tenantId = b.tenantId
            where b.tenantId = :tenantId and b.stockSiteId = :siteId
            group by b.stockItemId
            """)
    List<StockItemBalanceSummary> summarizeByStockItem(@Param("tenantId") Long tenantId,
                                                       @Param("siteId") Long siteId,
                                                       @Param("today") LocalDate today,
                                                       @Param("expiryLimit") LocalDate expiryLimit);

    interface StockItemBalanceSummary {
        Long getStockItemId();
        BigDecimal getQuantityOnHand();
        BigDecimal getQuantityAvailable();
        BigDecimal getQuantityReserved();
        BigDecimal getQuantityFrozen();
        Long getActiveRows();
        Long getActiveLots();
        Long getBinCount();
        Long getExpiringLots();
        LocalDate getEarliestExpiry();
        Instant getLatestProjectedAt();
        Long getCostedRows();
        BigDecimal getCostedQuantity();
        BigDecimal getCostedAmount();
    }

    /** 库存页按批号搜索仍需要每个库存项涉及的批号；只回传去重批号，不重复回传批次×库位明细。 */
    @Query("""
            select b.stockItemId as stockItemId, l.lotNo as lotNo
            from InventoryBalance b, StockLot l
            where b.tenantId = :tenantId and b.stockSiteId = :siteId
              and l.id = b.stockLotId and l.tenantId = b.tenantId and l.lotNo is not null
            group by b.stockItemId, l.lotNo
            """)
    List<StockItemLotNo> distinctLotNosByStockItem(@Param("tenantId") Long tenantId,
                                                   @Param("siteId") Long siteId);

    interface StockItemLotNo {
        Long getStockItemId();
        String getLotNo();
    }

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select b from InventoryBalance b where b.id = :id and b.tenantId = :tenantId")
    Optional<InventoryBalance> lockByIdAndTenantId(@Param("id") Long id, @Param("tenantId") Long tenantId);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            select b from InventoryBalance b
            where b.tenantId = :tenantId and b.stockSiteId = :siteId
            order by b.stockBinId, b.stockItemId, b.stockLotId, b.stockStatus
            """)
    List<InventoryBalance> lockSiteBalances(@Param("tenantId") Long tenantId, @Param("siteId") Long siteId);
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
    Page<InventoryBalance> findByTenantIdAndStockSiteIdAndStockItemIdOrderByProjectedAtDesc(
            Long tenantId, Long stockSiteId, Long stockItemId, Pageable pageable);
}
