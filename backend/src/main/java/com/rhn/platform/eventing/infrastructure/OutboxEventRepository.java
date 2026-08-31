package com.rhn.platform.eventing.infrastructure;

import com.rhn.platform.eventing.domain.OutboxEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;

import java.util.List;
import java.time.Instant;

public interface OutboxEventRepository extends JpaRepository<OutboxEvent, Long> {
    long countByTenantId(Long tenantId);
    List<OutboxEvent> findByAggregateIdOrderByRecordedAt(Long aggregateId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            select event from OutboxEvent event
             where event.publicationStatus = 'PENDING'
               and event.nextAttemptAt <= :now
               and (event.claimedUntil is null or event.claimedUntil < :now)
             order by event.recordedAt
            """)
    List<OutboxEvent> lockDispatchable(@Param("now") Instant now, org.springframework.data.domain.Pageable pageable);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select event from OutboxEvent event where event.eventId = :eventId")
    java.util.Optional<OutboxEvent> lockByEventId(@Param("eventId") Long eventId);
}
