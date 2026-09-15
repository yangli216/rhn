package com.rhn.healthplanning.infrastructure;

import com.rhn.healthplanning.domain.CareTaskEvent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CareTaskEventRepository extends JpaRepository<CareTaskEvent, Long> {
    boolean existsByTenantIdAndCareTaskIdAndCommandCode(Long tenantId, Long careTaskId, String commandCode);
    List<CareTaskEvent> findByTenantIdAndCareTaskIdOrderByOccurredAt(Long tenantId, Long careTaskId);
}
