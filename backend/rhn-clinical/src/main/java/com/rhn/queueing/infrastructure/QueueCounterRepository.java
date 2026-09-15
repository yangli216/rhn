package com.rhn.queueing.infrastructure;

import com.rhn.queueing.domain.QueueCounter;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

import java.time.LocalDate;
import java.util.Optional;

public interface QueueCounterRepository extends JpaRepository<QueueCounter, Long> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<QueueCounter> findByTenantIdAndServiceQueueIdAndBusinessDate(
            Long tenantId, Long serviceQueueId, LocalDate businessDate);
}
