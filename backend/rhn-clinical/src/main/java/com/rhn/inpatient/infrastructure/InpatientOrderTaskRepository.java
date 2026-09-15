package com.rhn.inpatient.infrastructure;

import com.rhn.inpatient.domain.InpatientOrderTask;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Collection;

public interface InpatientOrderTaskRepository extends JpaRepository<InpatientOrderTask, Long> {
    List<InpatientOrderTask> findByTenantIdAndRequestIdOrderByOccurrenceNoAsc(Long tenantId, Long requestId);

    List<InpatientOrderTask> findByTenantIdOrderByScheduledAtAsc(Long tenantId);

    List<InpatientOrderTask> findByTenantIdAndStatusAndScheduledAtGreaterThanEqualAndScheduledAtLessThanOrderByScheduledAtAsc(
            Long tenantId, String status, Instant windowFrom, Instant windowTo);

    List<InpatientOrderTask> findByTenantIdAndRequestIdInAndStatusOrderByScheduledAtAsc(
            Long tenantId, Collection<Long> requestIds, String status);

    @Query("select value from InpatientOrderTask value where value.tenantId = :tenantId "
            + "and value.status = 'PLANNED' and value.requestId in "
            + "(select workflow.requestId from InpatientOrderWorkflow workflow "
            + "where workflow.tenantId = :tenantId and workflow.episodeId = :episodeId) "
            + "order by value.scheduledAt")
    List<InpatientOrderTask> findPlannedByEpisode(@Param("tenantId") Long tenantId,
                                                   @Param("episodeId") Long episodeId);

    boolean existsByTenantIdAndRequestIdAndScheduledAt(Long tenantId, Long requestId, Instant scheduledAt);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select value from InpatientOrderTask value where value.tenantId = :tenantId and value.id = :taskId")
    Optional<InpatientOrderTask> findLocked(@Param("tenantId") Long tenantId, @Param("taskId") Long taskId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select value from InpatientOrderTask value where value.tenantId = :tenantId "
            + "and value.requestId = :requestId order by value.occurrenceNo")
    List<InpatientOrderTask> findLockedByRequest(@Param("tenantId") Long tenantId,
                                                  @Param("requestId") Long requestId);
}
