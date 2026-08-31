package com.rhn.diagnostics.infrastructure;

import com.rhn.diagnostics.domain.CriticalValueAlert;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface CriticalValueAlertRepository extends JpaRepository<CriticalValueAlert, Long> {
    Optional<CriticalValueAlert> findByTenantIdAndReportIdAndObservationId(Long tenantId, Long reportId, Long observationId);
    List<CriticalValueAlert> findByTenantIdAndReportId(Long tenantId, Long reportId);
    List<CriticalValueAlert> findByTenantIdAndOrganizationIdAndStatusInOrderByDetectedAtDesc(
            Long tenantId, Long organizationId, List<String> statuses);
    List<CriticalValueAlert> findTop100ByStatusInAndAcknowledgeDeadlineAtBeforeOrderByAcknowledgeDeadlineAtAsc(
            List<String> statuses, Instant deadline);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select value from CriticalValueAlert value where value.id = :id and value.tenantId = :tenantId")
    Optional<CriticalValueAlert> lockByIdAndTenantId(@Param("id") Long id, @Param("tenantId") Long tenantId);
}
