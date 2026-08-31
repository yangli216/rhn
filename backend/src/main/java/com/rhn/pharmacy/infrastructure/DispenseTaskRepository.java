package com.rhn.pharmacy.infrastructure;

import com.rhn.pharmacy.domain.DispenseTask;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.Collection;

public interface DispenseTaskRepository extends JpaRepository<DispenseTask, Long> {
    Optional<DispenseTask> findByIdAndTenantId(Long id, Long tenantId);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from DispenseTask t where t.id = :id and t.tenantId = :tenantId")
    Optional<DispenseTask> lockByIdAndTenantId(@Param("id") Long id, @Param("tenantId") Long tenantId);
    List<DispenseTask> findByTenantIdAndStockSiteIdOrderByCreatedAtDesc(Long tenantId, Long stockSiteId);
    List<DispenseTask> findByTenantIdAndStockSiteIdAndStatusOrderByCreatedAtDesc(
            Long tenantId, Long stockSiteId, String status);
    List<DispenseTask> findByTenantIdAndEncounterIdIn(Long tenantId, Collection<Long> encounterIds);
}
