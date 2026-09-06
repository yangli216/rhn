package com.rhn.outpatient.encounter;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.Collection;
import java.time.Instant;
import org.springframework.data.domain.Pageable;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

interface EncounterRepository extends JpaRepository<Encounter, Long> {
    Optional<Encounter> findByIdAndTenantId(Long id, Long tenantId);
    List<Encounter> findByTenantIdAndIdIn(Long tenantId, Collection<Long> ids);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select value from Encounter value where value.id = :id and value.tenantId = :tenantId")
    Optional<Encounter> findWithLockByIdAndTenantId(@Param("id") Long id, @Param("tenantId") Long tenantId);
    Optional<Encounter> findFirstByTenantIdAndResidentIdAndOrganizationIdAndDepartmentIdAndStatusIn(
            Long tenantId, Long residentId, Long organizationId, Long departmentId,
            Collection<EncounterStatus> statuses);
    List<Encounter> findByTenantIdAndResidentIdAndOrganizationIdAndDepartmentIdAndStatusIn(
            Long tenantId, Long residentId, Long organizationId, Long departmentId,
            Collection<EncounterStatus> statuses);
    List<Encounter> findTop20ByTenantIdAndResidentIdOrderByRegisteredAtDesc(Long tenantId, Long residentId);
    List<Encounter> findTop20ByTenantIdAndResidentIdAndOrganizationIdAndDepartmentIdOrderByRegisteredAtDesc(
            Long tenantId, Long residentId, Long organizationId, Long departmentId);
    List<Encounter> findByTenantIdAndOrganizationIdAndDepartmentIdAndRegisteredAtGreaterThanEqualAndRegisteredAtLessThanOrderByRegisteredAtDesc(
            Long tenantId, Long organizationId, Long departmentId, Instant fromInclusive, Instant toExclusive,
            Pageable pageable);
}
