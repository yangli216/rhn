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
    @Column(name = "slot_hold_id") private Long slotHoldId;
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
    @Column(name = "checked_in_at") private Instant checkedInAt;
    @Column(name = "booking_source", nullable = false) private String bookingSource;
    @Column(name = "cancelled_at") private Instant cancelledAt;
    @Column(name = "cancellation_reason") private String cancellationReason;
    @Column(name = "rescheduled_from_id") private Long rescheduledFromId;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "created_by", nullable = false) private Long createdBy;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "updated_by", nullable = false) private Long updatedBy;

    protected Appointment() {}

    Appointment(Long tenantId, ServiceSchedule schedule, ScheduleSlotPool pool, Long slotHoldId, Long residentId,
                String idempotencyCode, Long actorId) {
        this(tenantId, schedule, pool, slotHoldId, residentId, idempotencyCode,
                "REGISTERED", "WINDOW", null, actorId);
        this.checkedInAt = this.confirmedAt;
    }

    Appointment(Long tenantId, ServiceSchedule schedule, ScheduleSlotPool pool, Long residentId,
                String idempotencyCode, String bookingSource, Long rescheduledFromId, Long actorId) {
        this(tenantId, schedule, pool, null, residentId, idempotencyCode,
                "BOOKED", bookingSource, rescheduledFromId, actorId);
    }

    private Appointment(Long tenantId, ServiceSchedule schedule, ScheduleSlotPool pool, Long slotHoldId,
                        Long residentId, String idempotencyCode, String status, String bookingSource,
                        Long rescheduledFromId, Long actorId) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.scheduleId = schedule.id();
        this.slotPoolId = pool.id(); this.slotHoldId = slotHoldId; this.residentId = residentId; this.appointmentNo = "AP" + id;
        this.idempotencyCode = idempotencyCode; this.status = status; this.bookingSource = bookingSource;
        this.rescheduledFromId = rescheduledFromId;
        this.serviceCode = schedule.serviceCode(); this.serviceNameSnapshot = schedule.serviceName();
        this.practitionerId = schedule.practitionerId(); this.practitionerNameSnapshot = schedule.practitionerName();
        this.startAt = schedule.startAt(); this.endAt = schedule.endAt(); this.quantity = 1;
        this.confirmedAt = Instant.now(); this.createdAt = confirmedAt; this.createdBy = actorId;
        this.updatedAt = confirmedAt; this.updatedBy = actorId;
    }

    void cancel(String reason, Long actorId) {
        if (!"BOOKED".equals(status)) {
            throw com.rhn.shared.api.BusinessErrors.conflict("APPOINTMENT_NOT_CANCELLABLE", "只有待就诊预约可以取消");
        }
        status = "CANCELLED";
        cancellationReason = reason;
        cancelledAt = Instant.now();
        updatedAt = cancelledAt;
        updatedBy = actorId;
    }

    void cancelAfterRegistration(String reason, Long actorId) {
        if ("CANCELLED".equals(status)) return;
        if (!"REGISTERED".equals(status)) {
            throw com.rhn.shared.api.BusinessErrors.conflict("APPOINTMENT_NOT_WITHDRAWABLE",
                    "只有已到院且尚未就诊的预约可以随挂号一起撤销");
        }
        status = "CANCELLED";
        cancellationReason = reason;
        cancelledAt = Instant.now();
        updatedAt = cancelledAt;
        updatedBy = actorId;
    }

    void checkIn(Long actorId) {
        if (!"BOOKED".equals(status)) {
            throw com.rhn.shared.api.BusinessErrors.conflict("APPOINTMENT_NOT_CHECK_IN_READY",
                    "预约当前状态不能办理挂号");
        }
        status = "REGISTERED";
        checkedInAt = Instant.now();
        updatedAt = checkedInAt;
        updatedBy = actorId;
    }

    boolean visited(Long actorId) {
        if (status.equals("REGISTERED")) {
            status = "VISITED";
            updatedAt = Instant.now();
            updatedBy = actorId;
            return true;
        }
        return false;
    }

    Long id() { return id; }
    long revision() { return revision; }
    Long tenantId() { return tenantId; }
    Long scheduleId() { return scheduleId; }
    Long slotPoolId() { return slotPoolId; }
    Long residentId() { return residentId; }
    String appointmentNo() { return appointmentNo; }
    String status() { return status; }
    String serviceCode() { return serviceCode; }
    String serviceName() { return serviceNameSnapshot; }
    Long practitionerId() { return practitionerId; }
    String practitionerName() { return practitionerNameSnapshot; }
    Instant startAt() { return startAt; }
    Instant endAt() { return endAt; }
    String bookingSource() { return bookingSource; }
    Instant confirmedAt() { return confirmedAt; }
    Instant checkedInAt() { return checkedInAt; }
    Instant cancelledAt() { return cancelledAt; }
    String cancellationReason() { return cancellationReason; }
    Long rescheduledFromId() { return rescheduledFromId; }
    Instant createdAt() { return createdAt; }
    Instant updatedAt() { return updatedAt; }
}

@Entity
@Table(name = "appointment_events")
class AppointmentEvent {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "appointment_id", nullable = false) private Long appointmentId;
    @Column(name = "replacement_appointment_id") private Long replacementAppointmentId;
    @Column(name = "event_type", nullable = false) private String eventType;
    @Column(name = "status_from") private String statusFrom;
    @Column(name = "status_to", nullable = false) private String statusTo;
    @Column(name = "command_code", nullable = false) private String commandCode;
    @Column(name = "occurred_at", nullable = false) private Instant occurredAt;
    @Column(name = "occurred_by", nullable = false) private Long occurredBy;
    private String description;

    protected AppointmentEvent() {}

    AppointmentEvent(Long tenantId, Long appointmentId, Long replacementAppointmentId, String eventType,
                     String statusFrom, String statusTo, String commandCode, Long actorId, String description) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.appointmentId = appointmentId;
        this.replacementAppointmentId = replacementAppointmentId;
        this.eventType = eventType;
        this.statusFrom = statusFrom;
        this.statusTo = statusTo;
        this.commandCode = commandCode;
        this.occurredAt = Instant.now();
        this.occurredBy = actorId;
        this.description = description;
    }

    Long replacementAppointmentId() { return replacementAppointmentId; }
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
    void cancel() {
        if ("CANCELLED".equals(status)) return;
        if (!"REGISTERED".equals(status)) {
            throw com.rhn.shared.api.BusinessErrors.conflict("REGISTRATION_NOT_WITHDRAWABLE",
                    "当前挂号状态不能退号");
        }
        status = "CANCELLED";
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
    String suspend() {
        String previous = status;
        if (!status.equals("IN_SERVICE")) throw com.rhn.shared.api.BusinessErrors.conflict(
                "QUEUE_TICKET_NOT_IN_SERVICE", "只有接诊中的候诊票可以暂挂");
        status = "SUSPENDED";
        return previous;
    }
    String resume() {
        String previous = status;
        if (!status.equals("SUSPENDED")) throw com.rhn.shared.api.BusinessErrors.conflict(
                "QUEUE_TICKET_NOT_SUSPENDED", "只有已暂挂的候诊票可以恢复接诊");
        status = "IN_SERVICE";
        calledAt = Instant.now();
        return previous;
    }
    String cancel() {
        String previous = status;
        if ("CANCELLED".equals(status)) return previous;
        if (!"WAITING".equals(status)) throw com.rhn.shared.api.BusinessErrors.conflict(
                "QUEUE_TICKET_NOT_WITHDRAWABLE", "只有尚未开始接诊的候诊号可以退号");
        status = "CANCELLED";
        completedAt = Instant.now();
        return previous;
    }
    String terminate() {
        String previous = status;
        if ("TERMINATED".equals(status)) return previous;
        if (!status.equals("IN_SERVICE") && !status.equals("SUSPENDED")) {
            throw com.rhn.shared.api.BusinessErrors.conflict(
                    "QUEUE_TICKET_NOT_TERMINABLE", "只有接诊中或已暂挂的候诊票可以终止");
        }
        status = "TERMINATED";
        completedAt = Instant.now();
        return previous;
    }
    String transfer() {
        String previous = status;
        if ("TRANSFERRED".equals(status)) return previous;
        if (!status.equals("SUSPENDED")) {
            throw com.rhn.shared.api.BusinessErrors.conflict(
                    "QUEUE_TICKET_NOT_TRANSFERABLE", "只有等待转科接收的候诊票可以完成转科");
        }
        status = "TRANSFERRED";
        completedAt = Instant.now();
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
