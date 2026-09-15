package com.rhn.pharmacy.infrastructure;

import com.rhn.pharmacy.domain.InventoryOpenPackage;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

public interface InventoryOpenPackageRepository extends JpaRepository<InventoryOpenPackage, Long> {
    Optional<InventoryOpenPackage> findByTenantIdAndRequestCode(Long tenantId, String requestCode);
    List<InventoryOpenPackage> findByTenantIdAndStockSiteIdOrderByOpenedAtDesc(Long tenantId, Long stockSiteId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            select p from InventoryOpenPackage p
            where p.tenantId = :tenantId and p.stockBinId = :binId and p.stockItemId = :itemId
              and p.stockLotId = :lotId and p.status = 'OPEN'
            order by p.openedAt asc, p.id asc
            """)
    List<InventoryOpenPackage> lockOpenByDimension(@Param("tenantId") Long tenantId,
                                                    @Param("binId") Long binId,
                                                    @Param("itemId") Long itemId,
                                                    @Param("lotId") Long lotId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            select p from InventoryOpenPackage p
            where p.tenantId = :tenantId and p.stockBinId = :binId and p.stockItemId = :itemId
              and p.stockLotId = :lotId and p.status in ('OPEN', 'CONSUMED')
              and p.remainingBaseQuantity < p.openedBaseQuantity
            order by p.updatedAt desc, p.id desc
            """)
    List<InventoryOpenPackage> lockRestorableByDimension(@Param("tenantId") Long tenantId,
                                                          @Param("binId") Long binId,
                                                          @Param("itemId") Long itemId,
                                                          @Param("lotId") Long lotId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            select p from InventoryOpenPackage p
            where p.tenantId = :tenantId and p.id in :ids and p.stockBinId = :binId
              and p.stockItemId = :itemId and p.stockLotId = :lotId
              and p.status in ('OPEN', 'CONSUMED') and p.remainingBaseQuantity < p.openedBaseQuantity
            order by p.updatedAt desc, p.id desc
            """)
    List<InventoryOpenPackage> lockRestorableByIds(@Param("tenantId") Long tenantId, @Param("ids") List<Long> ids,
                                                    @Param("binId") Long binId, @Param("itemId") Long itemId,
                                                    @Param("lotId") Long lotId);

    @Query("""
            select coalesce(sum(p.remainingBaseQuantity), 0) from InventoryOpenPackage p
            where p.tenantId = :tenantId and p.stockBinId = :binId and p.stockItemId = :itemId
              and p.stockLotId = :lotId and p.status = 'OPEN'
            """)
    BigDecimal sumOpenRemaining(@Param("tenantId") Long tenantId, @Param("binId") Long binId,
                                @Param("itemId") Long itemId, @Param("lotId") Long lotId);
}
