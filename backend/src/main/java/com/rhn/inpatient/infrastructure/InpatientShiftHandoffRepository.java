package com.rhn.inpatient.infrastructure;

import com.rhn.inpatient.domain.InpatientShiftHandoff;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface InpatientShiftHandoffRepository extends JpaRepository<InpatientShiftHandoff, Long> {
    Optional<InpatientShiftHandoff> findByIdAndTenantId(Long id, Long tenantId);
    Optional<InpatientShiftHandoff> findByTenantIdAndCreateCommandCode(Long tenantId, String commandCode);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select value from InpatientShiftHandoff value where value.tenantId = :tenantId and value.id = :handoffId")
    Optional<InpatientShiftHandoff> findLocked(@Param("tenantId") Long tenantId,
                                               @Param("handoffId") Long handoffId);

    List<InpatientShiftHandoff>
    findByTenantIdAndOrganizationIdAndDepartmentIdAndShiftFromLessThanAndShiftToGreaterThanOrderByShiftFromDescIdDesc(
            Long tenantId, Long organizationId, Long departmentId, Instant to, Instant from);
}

