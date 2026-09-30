package com.rhn.pharmacy.infrastructure;

import com.rhn.pharmacy.domain.StockCount;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface StockCountRepository extends JpaRepository<StockCount, Long> {
    Optional<StockCount> findByTenantIdAndRequestCode(Long tenantId, String requestCode);

    List<StockCount> findByTenantIdAndStockSiteIdOrderBySnapshotAtDesc(Long tenantId, Long siteId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select v from StockCount v where v.id=:id and v.tenantId=:tenantId")
    Optional<StockCount> lockByIdAndTenantId(@Param("id") Long id, @Param("tenantId") Long tenantId);
}
