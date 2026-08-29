package com.rhn.outpatient.scheduling;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "schedule_slot_holds")
class ScheduleSlotHold {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "slot_pool_id", nullable = false) private Long slotPoolId;
    @Column(name = "schedule_id", nullable = false) private Long scheduleId;
    @Column(name = "resident_id", nullable = false) private Long residentId;
    @Column(name = "idempotency_code", nullable = false) private String idempotencyCode;
    @Column(nullable = false) private int quantity;
    @Column(nullable = false) private String status;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "expires_at", nullable = false) private Instant expiresAt;
    @Column(name = "closed_at") private Instant closedAt;
    @Column(name = "consumed_registration_id") private Long consumedRegistrationId;

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
