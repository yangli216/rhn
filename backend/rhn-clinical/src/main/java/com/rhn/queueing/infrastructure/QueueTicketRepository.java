package com.rhn.queueing.infrastructure;

import com.rhn.queueing.domain.QueueTicket;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface QueueTicketRepository extends JpaRepository<QueueTicket, Long> {
    Optional<QueueTicket> findByIdAndTenantId(Long id, Long tenantId);

    Optional<QueueTicket> findByTenantIdAndIdempotencyCode(Long tenantId, String idempotencyCode);

    Optional<QueueTicket> findByTenantIdAndSourceTypeAndSourceId(Long tenantId, String sourceType, Long sourceId);

    List<QueueTicket> findByTenantIdAndSourceTypeAndSourceIdIn(
            Long tenantId, String sourceType, Collection<Long> sourceIds);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select ticket from QueueTicket ticket where ticket.id = :id and ticket.tenantId = :tenantId")
    Optional<QueueTicket> lockByIdAndTenantId(@Param("id") Long id, @Param("tenantId") Long tenantId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select ticket from QueueTicket ticket where ticket.tenantId = :tenantId "
            + "and ticket.sourceType = :sourceType and ticket.sourceId = :sourceId")
    Optional<QueueTicket> lockBySource(@Param("tenantId") Long tenantId,
                                       @Param("sourceType") String sourceType,
                                       @Param("sourceId") Long sourceId);

    @Query("select ticket from QueueTicket ticket where ticket.tenantId = :tenantId "
            + "and ticket.serviceQueueId = :queueId and ticket.businessDate = :businessDate "
            + "and (:status is null or ticket.status = :status)")
    Page<QueueTicket> search(@Param("tenantId") Long tenantId, @Param("queueId") Long queueId,
                             @Param("businessDate") LocalDate businessDate,
                             @Param("status") String status, Pageable pageable);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select ticket from QueueTicket ticket where ticket.tenantId = :tenantId "
            + "and ticket.serviceQueueId = :queueId and ticket.businessDate = :businessDate "
            + "and ticket.status = 'WAITING' and ticket.readyAt is not null and ticket.readyAt <= :now "
            + "order by ticket.priority desc, ticket.checkedInAt asc, ticket.sequenceNo asc")
    List<QueueTicket> lockNextReady(@Param("tenantId") Long tenantId, @Param("queueId") Long queueId,
                                    @Param("businessDate") LocalDate businessDate,
                                    @Param("now") Instant now, Pageable pageable);
}
