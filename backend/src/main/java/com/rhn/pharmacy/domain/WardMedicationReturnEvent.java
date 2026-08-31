package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "ward_med_return_events")
public class WardMedicationReturnEvent {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "return_request_id", nullable = false) private Long returnRequestId;
    @Column(name = "event_type", nullable = false) private String eventType;
    @Column(name = "from_status") private String fromStatus;
    @Column(name = "to_status", nullable = false) private String toStatus;
    @Column(name = "command_code", nullable = false) private String commandCode;
    @Column(name = "payload_hash", nullable = false) private String payloadHash;
    @Column(name = "occurred_at", nullable = false) private Instant occurredAt;
    @Column(name = "occurred_by", nullable = false) private Long occurredBy;
    @Column(name = "note") private String note;

    protected WardMedicationReturnEvent() {
    }

    public WardMedicationReturnEvent(WardMedicationReturnRequest request, String eventType,
                                     String fromStatus, String commandCode, String payloadHash,
                                     Long actorId, String note) {
        this.id = GlobalIds.next();
        this.tenantId = request.tenantId();
        this.returnRequestId = request.id();
        this.eventType = eventType;
        this.fromStatus = fromStatus;
        this.toStatus = request.status();
        this.commandCode = commandCode;
        this.payloadHash = payloadHash;
        this.occurredAt = Instant.now();
        this.occurredBy = actorId;
        this.note = note;
    }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public Long returnRequestId() { return returnRequestId; }
    public String eventType() { return eventType; }
    public String fromStatus() { return fromStatus; }
    public String toStatus() { return toStatus; }
    public String commandCode() { return commandCode; }
    public String payloadHash() { return payloadHash; }
    public Instant occurredAt() { return occurredAt; }
    public Long occurredBy() { return occurredBy; }
    public String note() { return note; }
}
