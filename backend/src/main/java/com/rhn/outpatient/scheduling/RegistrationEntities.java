package com.rhn.outpatient.scheduling;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

final class RegistrationEntities {
    private RegistrationEntities() {}
}

@Entity
@Table(name = "RHN_SC_APPT")
class Appointment {
    @Id @Column(name = "ID_APPT") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_SVC_SCHED", nullable = false) private Long scheduleId;
    @Column(name = "ID_SCHED_SLOT_POOL", nullable = false) private Long slotPoolId;
    @Column(name = "ID_SCHED_SLOT_HOLD") private Long slotHoldId;
    @Column(name = "ID_PAT", nullable = false) private Long residentId;
    @Column(name = "CD_APPT_NO", nullable = false) private String appointmentNo;
    @Column(name = "CD_IDEMP", nullable = false) private String idempotencyCode;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "CD_SVC", nullable = false) private String serviceCode;
    @Column(name = "NA_SVC_SNAP", nullable = false) private String serviceNameSnapshot;
    @Column(name = "ID_PRACT") private Long practitionerId;
    @Column(name = "NA_PRACT_SNAP") private String practitionerNameSnapshot;
    @Column(name = "DT_START", nullable = false) private Instant startAt;
    @Column(name = "DT_END", nullable = false) private Instant endAt;
    @Column(name = "QTY_APPT", nullable = false) private int quantity;
    @Column(name = "DT_CONFIRMED", nullable = false) private Instant confirmedAt;
    @Column(name = "DT_CHECKED_IN") private Instant checkedInAt;
    @Column(name = "SD_BOOKING_SRC", nullable = false) private String bookingSource;
    @Column(name = "DT_CANCELLED") private Instant cancelledAt;
    @Column(name = "DES_CANCELLATION_REASON") private String cancellationReason;
    @Column(name = "ID_APPT_RESCHEDULED_FROM") private Long rescheduledFromId;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED", nullable = false) private Long createdBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED", nullable = false) private Long updatedBy;

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
@Table(name = "RHN_SC_APPT_EVT")
class AppointmentEvent {
    @Id @Column(name = "ID_APPT_EVT") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_APPT", nullable = false) private Long appointmentId;
    @Column(name = "ID_APPT_REPLACEMENT") private Long replacementAppointmentId;
    @Column(name = "SD_EVT_TYPE", nullable = false) private String eventType;
    @Column(name = "SD_STATUS_FROM") private String statusFrom;
    @Column(name = "SD_STATUS_TO", nullable = false) private String statusTo;
    @Column(name = "CD_COMMAND", nullable = false) private String commandCode;
    @Column(name = "DT_OCCURRED", nullable = false) private Instant occurredAt;
    @Column(name = "ID_USER_OCCURRED", nullable = false) private Long occurredBy;
    @Column(name = "DES_APPT_EVT") private String description;

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
@Table(name = "RHN_SC_PAT_REG")
class PatientRegistration {
    @Id @Column(name = "ID_PAT_REG") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_APPT") private Long appointmentId;
    @Column(name = "ID_SVC_SCHED") private Long scheduleId;
    @Column(name = "ID_PAT", nullable = false) private Long residentId;
    @Column(name = "ID_ORG", nullable = false) private Long organizationId;
    @Column(name = "ID_DEPT", nullable = false) private Long departmentId;
    @Column(name = "ID_ENC", nullable = false) private Long encounterId;
    @Column(name = "CD_REG_NO", nullable = false) private String registrationNo;
    @Column(name = "CD_IDEMP", nullable = false) private String idempotencyCode;
    @Column(name = "SD_REG_SRC", nullable = false) private String registrationSource;
    @Column(name = "SD_VISIT_TYPE", nullable = false) private String visitType;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DT_REGISTERED", nullable = false) private Instant registeredAt;
    @Column(name = "ID_USER_REGISTERED", nullable = false) private Long registeredBy;
    @Column(name = "DT_STARTED") private Instant startedAt;
    @Column(name = "DT_COMPLETED") private Instant completedAt;

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
