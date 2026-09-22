package com.rhn.outpatient.scheduling;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "RHN_SC_SCHED_SLOT_HOLD")
class ScheduleSlotHold {
    @Id @Column(name = "ID_SCHED_SLOT_HOLD") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_SCHED_SLOT_POOL", nullable = false) private Long slotPoolId;
    @Column(name = "ID_SVC_SCHED", nullable = false) private Long scheduleId;
    @Column(name = "ID_PAT", nullable = false) private Long residentId;
    @Column(name = "CD_IDEMP", nullable = false) private String idempotencyCode;
    @Column(name = "QTY_HELD", nullable = false) private int quantity;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "DT_EXPIRES", nullable = false) private Instant expiresAt;
    @Column(name = "DT_CLOSED") private Instant closedAt;
    @Column(name = "ID_PAT_REG_CNSMD") private Long consumedRegistrationId;

    protected ScheduleSlotHold() {}

    ScheduleSlotHold(Long tenantId, Long slotPoolId, Long scheduleId, Long residentId,
                     String idempotencyCode, Instant expiresAt) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.slotPoolId = slotPoolId;
        this.scheduleId = scheduleId;
        this.residentId = residentId;
        this.idempotencyCode = idempotencyCode;
        this.quantity = 1;
        this.status = "ACTIVE";
        this.createdAt = Instant.now();
        this.expiresAt = expiresAt;
    }

    void consume() {
        this.status = "CONSUMED";
        this.closedAt = Instant.now();
    }

    void release(boolean expired) {
        this.status = expired ? "EXPIRED" : "RELEASED";
        this.closedAt = Instant.now();
    }

    void bindRegistration(Long registrationId) { this.consumedRegistrationId = registrationId; }

    Long id() { return id; }
    Long tenantId() { return tenantId; }
    Long slotPoolId() { return slotPoolId; }
    Long scheduleId() { return scheduleId; }
    Long residentId() { return residentId; }
    String idempotencyCode() { return idempotencyCode; }
    String status() { return status; }
    Instant expiresAt() { return expiresAt; }
    Long consumedRegistrationId() { return consumedRegistrationId; }
}
