package com.rhn.pharmacy.infrastructure;

import com.rhn.pharmacy.domain.InventoryPeriod;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;

import java.util.List;
import java.util.Optional;

public interface InventoryPeriodRepository extends JpaRepository<InventoryPeriod, Long> {
    Optional<InventoryPeriod> findByTenantIdAndStockSiteIdAndPeriodCode(Long tenantId, Long stockSiteId, String periodCode);
    List<InventoryPeriod> findByTenantIdAndStockSiteIdOrderByPeriodFromDesc(Long tenantId, Long stockSiteId);

    @Lock(LockModeType.PESSIMISTIC_READ)
    @Query("select p from InventoryPeriod p where p.tenantId = :tenantId and p.stockSiteId = :siteId and p.periodCode = :code")
    Optional<InventoryPeriod> lockForPosting(@Param("tenantId") Long tenantId,
                                             @Param("siteId") Long siteId,
                                             @Param("code") String code);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from InventoryPeriod p where p.id = :id and p.tenantId = :tenantId")
    Optional<InventoryPeriod> lockById(@Param("tenantId") Long tenantId, @Param("id") Long id);
}
