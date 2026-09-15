package com.rhn.pharmacy.infrastructure;

import com.rhn.pharmacy.domain.DispenseTaskLine;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.Collection;

public interface DispenseTaskLineRepository extends JpaRepository<DispenseTaskLine, Long> {
    boolean existsByTenantIdAndRequestId(Long tenantId, Long requestId);
    Optional<DispenseTaskLine> findByTenantIdAndFulfillmentSourceTypeAndFulfillmentSourceId(
            Long tenantId, String fulfillmentSourceType, Long fulfillmentSourceId);
    Optional<DispenseTaskLine> findByTenantIdAndTaskId(Long tenantId, Long taskId);
    List<DispenseTaskLine> findByTenantIdAndTaskIdOrderById(Long tenantId, Long taskId);
    List<DispenseTaskLine> findByTenantIdAndRequestIdIn(Long tenantId, Collection<Long> requestIds);
    List<DispenseTaskLine> findByTenantIdAndRequestIdOrderById(Long tenantId, Long requestId);
}
