package com.rhn.outpatient.scheduling;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.time.LocalDate;

final class RegistrationEntities {
    private RegistrationEntities() {}
}

@Entity
@Table(name = "appointments")
class Appointment {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "schedule_id", nullable = false) private Long scheduleId;
    @Column(name = "slot_pool_id", nullable = false) private Long slotPoolId;
    @Column(name = "resident_id", nullable = false) private Long residentId;
    @Column(name = "appointment_no", nullable = false) private String appointmentNo;
    @Column(name = "idempotency_code", nullable = false) private String idempotencyCode;
    @Column(nullable = false) private String status;
    @Column(name = "service_code", nullable = false) private String serviceCode;
    @Column(name = "service_name_snapshot", nullable = false) private String serviceNameSnapshot;
    @Column(name = "practitioner_id", nullable = false) private Long practitionerId;
    @Column(name = "practitioner_name_snapshot", nullable = false) private String practitionerNameSnapshot;
    @Column(name = "start_at", nullable = false) private Instant startAt;
    @Column(name = "end_at", nullable = false) private Instant endAt;
    @Column(nullable = false) private int quantity;
    @Column(name = "confirmed_at", nullable = false) private Instant confirmedAt;
    @Column(name = "checked_in_at", nullable = false) private Instant checkedInAt;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "created_by", nullable = false) private Long createdBy;

    protected Appointment() {}

    Appointment(Long tenantId, ServiceSchedule schedule, ScheduleSlotPool pool, Long residentId,
                String idempotencyCode, Long actorId) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.scheduleId = schedule.id();
        this.slotPoolId = pool.id(); this.residentId = residentId; this.appointmentNo = "AP" + id;
        this.idempotencyCode = idempotencyCode; this.status = "REGISTERED";
        this.serviceCode = schedule.serviceCode(); this.serviceNameSnapshot = schedule.serviceName();
        this.practitionerId = schedule.practitionerId(); this.practitionerNameSnapshot = schedule.practitionerName();
        this.startAt = schedule.startAt(); this.endAt = schedule.endAt(); this.quantity = 1;
        this.confirmedAt = Instant.now(); this.checkedInAt = confirmedAt; this.createdAt = confirmedAt;
        this.createdBy = actorId;
    }

    void visited() { if (status.equals("REGISTERED")) status = "VISITED"; }
    Long id() { return id; }
}

@Entity
@Table(name = "patient_registrations")
class PatientRegistration {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "appointment_id") private Long appointmentId;
    @Column(name = "schedule_id") private Long scheduleId;
    @Column(name = "resident_id", nullable = false) private Long residentId;
    @Column(name = "organization_id", nullable = false) private Long organizationId;
    @Column(name = "department_id", nullable = false) private Long departmentId;
    @Column(name = "encounter_id", nullable = false) private Long encounterId;
    @Column(name = "registration_no", nullable = false) private String registrationNo;
    @Column(name = "idempotency_code", nullable = false) private String idempotencyCode;
    @Column(name = "registration_source", nullable = false) private String registrationSource;
    @Column(name = "visit_type", nullable = false) private String visitType;
    @Column(nullable = false) private String status;
    @Column(name = "registered_at", nullable = false) private Instant registeredAt;
    @Column(name = "registered_by", nullable = false) private Long registeredBy;
    @Column(name = "started_at") private Instant startedAt;
    @Column(name = "completed_at") private Instant completedAt;

    protected PatientRegistration() {}

    PatientRegistration(Long tenantId, Long appointmentId, Long scheduleId, Long residentId,
                        Long organizationId, Long departmentId, Long encounterId, String idempotencyCode,
                        String registrationSource, String visitType, Long actorId) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.appointmentId = appointmentId;
        this.scheduleId = scheduleId; this.residentId = residentId; this.organizationId = organizationId;
        this.departmentId = departmentId; this.encounterId = encounterId; this.registrationNo = "RG" + id;
        this.idempotencyCode = idempotencyCode; this.registrationSource = registrationSource;
        this.visitType = visitType; this.status = "REGISTERED"; this.registeredAt = Instant.now();
        this.registeredBy = actorId;
    }

    void start() {
        if (status.equals("REGISTERED") && startedAt == null) startedAt = Instant.now();
    }
    void complete() {
        if (status.equals("REGISTERED") && completedAt == null) completedAt = Instant.now();
    }
    Long id() { return id; } Long tenantId() { return tenantId; } Long appointmentId() { return appointmentId; }
    Long scheduleId() { return scheduleId; } Long residentId() { return residentId; }
    Long encounterId() { return encounterId; } String registrationNo() { return registrationNo; }
    String registrationSource() { return registrationSource; } String visitType() { return visitType; }
    String status() { return status; } Instant registeredAt() { return registeredAt; }
}

@Entity
@Table(name = "queue_counters")
class QueueCounter {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "queue_code", nullable = false) private String queueCode;
    @Column(name = "queue_date", nullable = false) private LocalDate queueDate;
    @Column(name = "next_sequence", nullable = false) private int nextSequence;

    protected QueueCounter() {}
    QueueCounter(Long tenantId, String queueCode, LocalDate queueDate) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.queueCode = queueCode;
        this.queueDate = queueDate; this.nextSequence = 1;
    }
    int take() { return nextSequence++; }
}

@Entity
@Table(name = "queue_tickets")
class QueueTicket {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "registration_id", nullable = false) private Long registrationId;
    @Column(name = "idempotency_code", nullable = false) private String idempotencyCode;
    @Column(name = "queue_code", nullable = false) private String queueCode;
    @Column(name = "queue_date", nullable = false) private LocalDate queueDate;
    @Column(name = "ticket_no", nullable = false) private String ticketNo;
    @Column(name = "sequence_no", nullable = false) private int sequenceNo;
    @Column(nullable = false) private int priority;
    @Column(nullable = false) private String status;
    @Column(name = "queued_at", nullable = false) private Instant queuedAt;
    @Column(name = "called_at") private Instant calledAt;
    @Column(name = "completed_at") private Instant completedAt;

    protected QueueTicket() {}

    QueueTicket(Long tenantId, Long registrationId, String idempotencyCode, String queueCode,
                LocalDate queueDate, int sequenceNo) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.registrationId = registrationId;
        this.idempotencyCode = idempotencyCode; this.queueCode = queueCode; this.queueDate = queueDate;
        this.sequenceNo = sequenceNo; this.ticketNo = "%03d".formatted(sequenceNo);
        this.status = "WAITING"; this.queuedAt = Instant.now();
    }

    String start() {
        String previous = status;
        if (status.equals("WAITING")) { status = "IN_SERVICE"; calledAt = Instant.now(); }
        return previous;
    }
    String complete() {
        String previous = status;
        if (status.equals("IN_SERVICE")) { status = "COMPLETED"; completedAt = Instant.now(); }
        return previous;
    }
    Long id() { return id; } Long registrationId() { return registrationId; } String ticketNo() { return ticketNo; }
    int sequenceNo() { return sequenceNo; } int priority() { return priority; } String status() { return status; }
    Instant calledAt() { return calledAt; }
}

@Entity
@Table(name = "queue_ticket_events")
class QueueTicketEvent {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "queue_ticket_id", nullable = false) private Long queueTicketId;
    @Column(name = "event_type", nullable = false) private String eventType;
    @Column(name = "status_from") private String statusFrom;
    @Column(name = "status_to", nullable = false) private String statusTo;
    @Column(name = "command_code", nullable = false) private String commandCode;
    @Column(name = "occurred_at", nullable = false) private Instant occurredAt;
    @Column(name = "occurred_by", nullable = false) private Long occurredBy;
    private String description;

    protected QueueTicketEvent() {}

    QueueTicketEvent(Long tenantId, Long ticketId, String eventType, String statusFrom, String statusTo,
                     String commandCode, Long actorId, String description) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.queueTicketId = ticketId;
        this.eventType = eventType; this.statusFrom = statusFrom; this.statusTo = statusTo;
        this.commandCode = commandCode; this.occurredAt = Instant.now(); this.occurredBy = actorId;
        this.description = description;
    }
}
