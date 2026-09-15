package com.rhn.pharmacy.infrastructure;

import com.rhn.pharmacy.domain.InventoryTraceEvent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface InventoryTraceEventRepository extends JpaRepository<InventoryTraceEvent, Long> {
    List<InventoryTraceEvent> findByTenantIdAndTraceCodeIdOrderByOccurredAtAsc(Long tenantId, Long traceCodeId);
}
