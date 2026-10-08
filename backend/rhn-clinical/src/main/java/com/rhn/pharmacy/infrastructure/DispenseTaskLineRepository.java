package com.rhn.pharmacy.infrastructure;

import com.rhn.pharmacy.domain.DispenseTaskLine;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.Collection;

public interface DispenseTaskLineRepository extends JpaRepository<DispenseTaskLine, Long> {
    @Query("select distinct line.taskId from DispenseTaskLine line where line.tenantId = :tenantId and line.requestId = :requestId order by line.taskId")
    List<Long> findTaskIdsForRequest(@Param("tenantId") Long tenantId, @Param("requestId") Long requestId);
    boolean existsByTenantIdAndRequestId(Long tenantId, Long requestId);
    Optional<DispenseTaskLine> findByTenantIdAndFulfillmentSourceTypeAndFulfillmentSourceId(
            Long tenantId, String fulfillmentSourceType, Long fulfillmentSourceId);
    Optional<DispenseTaskLine> findByTenantIdAndTaskId(Long tenantId, Long taskId);
    List<DispenseTaskLine> findByTenantIdAndTaskIdOrderById(Long tenantId, Long taskId);
    List<DispenseTaskLine> findByTenantIdAndRequestIdIn(Long tenantId, Collection<Long> requestIds);
    List<DispenseTaskLine> findByTenantIdAndRequestIdOrderById(Long tenantId, Long requestId);
}
