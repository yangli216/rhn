package com.rhn.healthcore.timeline;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

interface HealthEventRepository extends JpaRepository<HealthEvent, Long> {
    List<HealthEvent> findByTenantIdAndResidentIdOrderByOccurredAtDesc(Long tenantId, Long residentId);
    boolean existsBySourceEventId(Long sourceEventId);
}
