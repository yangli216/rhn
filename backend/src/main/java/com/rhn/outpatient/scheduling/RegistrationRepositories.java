package com.rhn.outpatient.scheduling;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

interface AppointmentRepository extends JpaRepository<Appointment, Long> {
    Optional<Appointment> findByIdAndTenantId(Long id, Long tenantId);
}

interface PatientRegistrationRepository extends JpaRepository<PatientRegistration, Long> {
    Optional<PatientRegistration> findByTenantIdAndIdempotencyCode(Long tenantId, String idempotencyCode);
    Optional<PatientRegistration> findByTenantIdAndEncounterId(Long tenantId, Long encounterId);
    List<PatientRegistration> findByTenantIdAndOrganizationIdAndDepartmentIdAndRegisteredAtBetweenOrderByRegisteredAt(
            Long tenantId, Long organizationId, Long departmentId, java.time.Instant from, java.time.Instant to);
}

interface QueueCounterRepository extends JpaRepository<QueueCounter, Long> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<QueueCounter> findByTenantIdAndQueueCodeAndQueueDate(Long tenantId, String queueCode, LocalDate queueDate);
}

interface QueueTicketRepository extends JpaRepository<QueueTicket, Long> {
    Optional<QueueTicket> findByTenantIdAndRegistrationId(Long tenantId, Long registrationId);
    List<QueueTicket> findByTenantIdAndRegistrationIdIn(Long tenantId, List<Long> registrationIds);
}

interface QueueTicketEventRepository extends JpaRepository<QueueTicketEvent, Long> {
    boolean existsByTenantIdAndQueueTicketIdAndCommandCode(Long tenantId, Long queueTicketId, String commandCode);
}
