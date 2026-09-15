package com.rhn.pharmacy.infrastructure;

import com.rhn.pharmacy.domain.InventoryTransaction;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface InventoryTransactionRepository extends JpaRepository<InventoryTransaction, Long> {
    Optional<InventoryTransaction> findByTenantIdAndRequestCode(Long tenantId, String requestCode);
    List<InventoryTransaction> findByTenantIdAndInventoryPeriodIdOrderByPostedAtDesc(Long tenantId, Long periodId);
    Page<InventoryTransaction> findByTenantIdAndInventoryPeriodIdOrderByPostedAtDesc(
            Long tenantId, Long periodId, Pageable pageable);

    @Query(value = """
            select distinct t from InventoryTransaction t, InventoryTransactionLine l
            where t.tenantId = :tenantId and t.inventoryPeriodId = :periodId
              and l.inventoryTransactionId = t.id and l.tenantId = :tenantId and l.stockItemId = :stockItemId
            order by t.postedAt desc
            """, countQuery = """
            select count(distinct t.id) from InventoryTransaction t, InventoryTransactionLine l
            where t.tenantId = :tenantId and t.inventoryPeriodId = :periodId
              and l.inventoryTransactionId = t.id and l.tenantId = :tenantId and l.stockItemId = :stockItemId
            """)
    Page<InventoryTransaction> findPeriodItemHistory(@Param("tenantId") Long tenantId,
                                                      @Param("periodId") Long periodId,
                                                      @Param("stockItemId") Long stockItemId,
                                                      Pageable pageable);

    @Query("""
            select distinct t from InventoryTransaction t, InventoryTransactionLine l
            where t.tenantId = :tenantId and t.inventoryPeriodId = :periodId
              and l.inventoryTransactionId = t.id and l.tenantId = :tenantId and l.stockItemId = :stockItemId
            order by t.postedAt desc
            """)
    List<InventoryTransaction> findPeriodItemHistory(@Param("tenantId") Long tenantId,
                                                      @Param("periodId") Long periodId,
                                                      @Param("stockItemId") Long stockItemId);

    @Query("""
            select distinct t from InventoryTransaction t, InventoryPeriod p, InventoryTransactionLine l
            where t.tenantId = :tenantId
              and p.id = t.inventoryPeriodId and p.tenantId = :tenantId and p.stockSiteId = :siteId
              and l.inventoryTransactionId = t.id and l.tenantId = :tenantId and l.stockItemId = :stockItemId
            order by t.postedAt desc
            """)
    List<InventoryTransaction> findItemHistory(@Param("tenantId") Long tenantId,
                                               @Param("siteId") Long siteId,
                                               @Param("stockItemId") Long stockItemId);

    @Query(value = """
            select distinct t from InventoryTransaction t, InventoryPeriod p, InventoryTransactionLine l
            where t.tenantId = :tenantId
              and p.id = t.inventoryPeriodId and p.tenantId = :tenantId and p.stockSiteId = :siteId
              and l.inventoryTransactionId = t.id and l.tenantId = :tenantId and l.stockItemId = :stockItemId
            order by t.postedAt desc
            """, countQuery = """
            select count(distinct t.id) from InventoryTransaction t, InventoryPeriod p, InventoryTransactionLine l
            where t.tenantId = :tenantId
              and p.id = t.inventoryPeriodId and p.tenantId = :tenantId and p.stockSiteId = :siteId
              and l.inventoryTransactionId = t.id and l.tenantId = :tenantId and l.stockItemId = :stockItemId
            """)
    Page<InventoryTransaction> findItemHistory(@Param("tenantId") Long tenantId,
                                               @Param("siteId") Long siteId,
                                               @Param("stockItemId") Long stockItemId,
                                               Pageable pageable);
}
