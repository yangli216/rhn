package com.rhn.pharmacy.infrastructure;

import com.rhn.pharmacy.domain.InpatientMedicationSupplyGenerationRun;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface InpatientMedicationSupplyGenerationRunRepository
        extends JpaRepository<InpatientMedicationSupplyGenerationRun, Long> {
    Optional<InpatientMedicationSupplyGenerationRun> findByTenantIdAndJobKey(Long tenantId, String jobKey);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select value from InpatientMedicationSupplyGenerationRun value "
            + "where value.tenantId = :tenantId and value.jobKey = :jobKey")
    Optional<InpatientMedicationSupplyGenerationRun> lockByTenantIdAndJobKey(
            @Param("tenantId") Long tenantId, @Param("jobKey") String jobKey);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            select value from InpatientMedicationSupplyGenerationRun value
             where value.status in ('PENDING', 'FAILED', 'RUNNING')
               and value.nextAttemptAt <= :now
               and (value.claimedUntil is null or value.claimedUntil < :now)
             order by value.createdAt
            """)
    List<InpatientMedicationSupplyGenerationRun> lockDispatchable(
            @Param("now") Instant now, Pageable pageable);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select value from InpatientMedicationSupplyGenerationRun value where value.id = :id")
    Optional<InpatientMedicationSupplyGenerationRun> lockById(@Param("id") Long id);
}
