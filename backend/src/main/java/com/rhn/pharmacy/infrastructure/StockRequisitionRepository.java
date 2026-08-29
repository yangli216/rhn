package com.rhn.pharmacy.infrastructure;

import com.rhn.pharmacy.domain.StockRequisition;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface StockRequisitionRepository extends JpaRepository<StockRequisition, Long> {
    Optional<StockRequisition> findByTenantIdAndRequestCode(Long tenantId, String requestCode);
    List<StockRequisition> findByTenantIdAndSourceSiteIdOrderByRequestedAtDesc(Long tenantId, Long sourceSiteId);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select value from StockRequisition value where value.id = :id and value.tenantId = :tenantId")
    Optional<StockRequisition> lockByIdAndTenantId(@Param("id") Long id, @Param("tenantId") Long tenantId);
}
