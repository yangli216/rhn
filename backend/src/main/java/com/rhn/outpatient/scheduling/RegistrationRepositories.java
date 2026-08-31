package com.rhn.outpatient.scheduling;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

import java.time.LocalDate;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

interface AppointmentRepository extends JpaRepository<Appointment, Long> {
    Optional<Appointment> findByIdAndTenantId(Long id, Long tenantId);
    Optional<Appointment> findByTenantIdAndIdempotencyCode(Long tenantId, String idempotencyCode);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query(
            "select value from Appointment value where value.id = :id and value.tenantId = :tenantId")
    Optional<Appointment> findWithLockByIdAndTenantId(
            @org.springframework.data.repository.query.Param("id") Long id,
            @org.springframework.data.repository.query.Param("tenantId") Long tenantId);

    List<Appointment> findByTenantIdAndScheduleIdInAndStartAtBetweenOrderByStartAt(
            Long tenantId, Collection<Long> scheduleIds, Instant from, Instant to);

    boolean existsByTenantIdAndResidentIdAndScheduleIdAndStatusIn(
            Long tenantId, Long residentId, Long scheduleId, Collection<String> statuses);
}

interface AppointmentEventRepository extends JpaRepository<AppointmentEvent, Long> {
    Optional<AppointmentEvent> findByTenantIdAndAppointmentIdAndCommandCode(
            Long tenantId, Long appointmentId, String commandCode);
}

interface PatientRegistrationRepository extends JpaRepository<PatientRegistration, Long> {
    Optional<PatientRegistration> findByTenantIdAndIdempotencyCode(Long tenantId, String idempotencyCode);
    Optional<PatientRegistration> findByTenantIdAndEncounterId(Long tenantId, Long encounterId);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query(
            "select value from PatientRegistration value where value.tenantId = :tenantId and value.encounterId = :encounterId")
    Optional<PatientRegistration> findWithLockByTenantIdAndEncounterId(
            @org.springframework.data.repository.query.Param("tenantId") Long tenantId,
            @org.springframework.data.repository.query.Param("encounterId") Long encounterId);
    boolean existsByTenantIdAndAppointmentId(Long tenantId, Long appointmentId);
    List<PatientRegistration> findByTenantIdAndOrganizationIdAndDepartmentIdAndRegisteredAtGreaterThanEqualAndRegisteredAtLessThanOrderByRegisteredAt(
            Long tenantId, Long organizationId, Long departmentId, Instant fromInclusive, Instant toExclusive);
}

interface QueueCounterRepository extends JpaRepository<QueueCounter, Long> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<QueueCounter> findByTenantIdAndQueueCodeAndQueueDate(Long tenantId, String queueCode, LocalDate queueDate);
}

interface QueueTicketRepository extends JpaRepository<QueueTicket, Long> {
    Optional<QueueTicket> findByTenantIdAndRegistrationId(Long tenantId, Long registrationId);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query(
            "select value from QueueTicket value where value.tenantId = :tenantId and value.registrationId = :registrationId")
    Optional<QueueTicket> findWithLockByTenantIdAndRegistrationId(
            @org.springframework.data.repository.query.Param("tenantId") Long tenantId,
            @org.springframework.data.repository.query.Param("registrationId") Long registrationId);
    List<QueueTicket> findByTenantIdAndRegistrationIdIn(Long tenantId, List<Long> registrationIds);
}

interface QueueTicketEventRepository extends JpaRepository<QueueTicketEvent, Long> {
    boolean existsByTenantIdAndQueueTicketIdAndCommandCode(Long tenantId, Long queueTicketId, String commandCode);
}
