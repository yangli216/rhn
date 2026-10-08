package com.rhn.outpatient.encounter;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.Collection;
import java.time.Instant;
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
    @Query("""
            select encounter from Encounter encounter
            where encounter.tenantId = :tenantId and encounter.residentId = :residentId
              and encounter.organizationId = :organizationId and encounter.departmentId = :departmentId
              and encounter.status = :status and encounter.encounterClass = 'OUTPATIENT'
              and (:excludedEncounterId is null or encounter.id <> :excludedEncounterId)
              and (:registeredSince is null or encounter.registeredAt >= :registeredSince)
            order by encounter.registeredAt desc, encounter.id desc
            """)
    List<Encounter> findCompletedHistory(@Param("tenantId") Long tenantId, @Param("residentId") Long residentId,
            @Param("organizationId") Long organizationId, @Param("departmentId") Long departmentId,
            @Param("status") EncounterStatus status, @Param("excludedEncounterId") Long excludedEncounterId,
            @Param("registeredSince") Instant registeredSince, org.springframework.data.domain.Pageable pageable);
    List<Encounter> findByTenantIdAndOrganizationIdAndDepartmentIdAndRegisteredAtGreaterThanEqualAndRegisteredAtLessThanOrderByRegisteredAtDesc(
            Long tenantId, Long organizationId, Long departmentId, Instant fromInclusive, Instant toExclusive);
    List<Encounter> findByTenantIdAndOrganizationIdAndRegisteredAtGreaterThanEqualAndRegisteredAtLessThanOrderByRegisteredAtDesc(
            Long tenantId, Long organizationId, Instant fromInclusive, Instant toExclusive);
}
