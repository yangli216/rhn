package com.rhn.platform.eventing.infrastructure;

import com.rhn.platform.eventing.domain.OutboxEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import jakarta.persistence.LockModeType;

import java.util.List;
import java.time.Instant;

public interface OutboxEventRepository extends JpaRepository<OutboxEvent, Long> {
    long countByTenantId(Long tenantId);
    List<OutboxEvent> findByAggregateIdOrderByRecordedAt(Long aggregateId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    List<OutboxEvent> findTop50ByPublicationStatusAndNextAttemptAtLessThanEqualOrderByRecordedAtAsc(
            String publicationStatus, Instant nextAttemptAt);
}
