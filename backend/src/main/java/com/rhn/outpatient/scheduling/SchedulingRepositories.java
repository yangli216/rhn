package com.rhn.outpatient.scheduling;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

interface ServiceResourceRepository extends JpaRepository<ServiceResource, Long> {
    Optional<ServiceResource> findByTenantIdAndOrganizationIdAndDepartmentIdAndPractitionerIdAndCatalogItemId(
            Long tenantId, Long organizationId, Long departmentId, Long practitionerId, Long catalogItemId);
}

interface ScheduleTemplateRepository extends JpaRepository<ScheduleTemplate, Long> {}

interface ScheduleTemplatePeriodRepository extends JpaRepository<ScheduleTemplatePeriod, Long> {}

interface ScheduleGenerationRunRepository extends JpaRepository<ScheduleGenerationRun, Long> {
    Optional<ScheduleGenerationRun> findByTenantIdAndIdempotencyCode(Long tenantId, String idempotencyCode);
}

interface ServiceScheduleRepository extends JpaRepository<ServiceSchedule, Long> {
    Optional<ServiceSchedule> findByIdAndTenantId(Long id, Long tenantId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select value from ServiceSchedule value where value.id = :id and value.tenantId = :tenantId")
    Optional<ServiceSchedule> findWithLockByIdAndTenantId(@Param("id") Long id, @Param("tenantId") Long tenantId);

    boolean existsByTenantIdAndResourceIdAndStartAtAndEndAt(
            Long tenantId, Long resourceId, Instant startAt, Instant endAt);

    @Query("""
            select count(value) from ServiceSchedule value
            where value.tenantId = :tenantId
              and value.practitionerId = :practitionerId
              and value.serviceDate = :serviceDate
              and value.id <> :excludedId
              and value.status in ('PUBLISHED', 'SUSPENDED')
              and value.startAt < :endAt
              and value.endAt > :startAt
            """)
    long countPractitionerOverlaps(@Param("tenantId") Long tenantId,
                                   @Param("practitionerId") Long practitionerId,
                                   @Param("serviceDate") LocalDate serviceDate,
                                   @Param("excludedId") Long excludedId,
                                   @Param("startAt") Instant startAt,
                                   @Param("endAt") Instant endAt);

    List<ServiceSchedule> findByTenantIdAndGenerationRunIdOrderByStartAt(
            Long tenantId, Long generationRunId);

    List<ServiceSchedule> findByTenantIdAndOrganizationIdAndDepartmentIdAndServiceDateBetweenOrderByStartAt(
            Long tenantId, Long organizationId, Long departmentId, LocalDate dateFrom, LocalDate dateTo);
}

interface ScheduleSlotPoolRepository extends JpaRepository<ScheduleSlotPool, Long> {
    List<ScheduleSlotPool> findByTenantIdAndScheduleIdIn(Long tenantId, Collection<Long> scheduleIds);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<ScheduleSlotPool> findByTenantIdAndScheduleId(Long tenantId, Long scheduleId);

    @Query("select value from ScheduleSlotPool value where value.tenantId = :tenantId and value.scheduleId = :scheduleId")
    Optional<ScheduleSlotPool> findSnapshotByTenantIdAndScheduleId(@Param("tenantId") Long tenantId,
                                                                   @Param("scheduleId") Long scheduleId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select value from ScheduleSlotPool value where value.id = :id and value.tenantId = :tenantId")
    Optional<ScheduleSlotPool> findWithLockByIdAndTenantId(@Param("id") Long id,
                                                           @Param("tenantId") Long tenantId);
}

interface ScheduleSlotHoldRepository extends JpaRepository<ScheduleSlotHold, Long> {
    Optional<ScheduleSlotHold> findByTenantIdAndIdempotencyCode(Long tenantId, String idempotencyCode);
    Optional<ScheduleSlotHold> findByIdAndTenantId(Long id, Long tenantId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select value from ScheduleSlotHold value where value.id = :id and value.tenantId = :tenantId")
    Optional<ScheduleSlotHold> findWithLockByIdAndTenantId(@Param("id") Long id, @Param("tenantId") Long tenantId);

    List<ScheduleSlotHold> findByTenantIdAndSlotPoolIdAndStatusAndExpiresAtBefore(
            Long tenantId, Long poolId, String status, Instant expiresAt);
}

interface ServiceScheduleEventRepository extends JpaRepository<ServiceScheduleEvent, Long> {
    boolean existsByTenantIdAndScheduleIdAndCommandCode(Long tenantId, Long scheduleId, String commandCode);
}

interface SlotEventRepository extends JpaRepository<SlotEvent, Long> {
    Optional<SlotEvent> findTopByTenantIdAndPoolIdOrderBySequenceNoDesc(Long tenantId, Long poolId);
}
