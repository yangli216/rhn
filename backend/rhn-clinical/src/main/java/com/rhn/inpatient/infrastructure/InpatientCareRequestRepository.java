package com.rhn.inpatient.infrastructure;

import com.rhn.inpatient.domain.InpatientCareRequest;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.Collection;
import java.util.List;

public interface InpatientCareRequestRepository extends JpaRepository<InpatientCareRequest, Long> {
    Optional<InpatientCareRequest> findByIdAndTenantId(Long id, Long tenantId);
    List<InpatientCareRequest> findByTenantIdAndEncounterIdAndStatusInOrderByAuthoredAtAscIdAsc(
            Long tenantId, Long encounterId, Collection<String> statuses);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select value from InpatientCareRequest value where value.tenantId = :tenantId and value.id = :requestId")
    Optional<InpatientCareRequest> findLocked(@Param("tenantId") Long tenantId, @Param("requestId") Long requestId);
}
