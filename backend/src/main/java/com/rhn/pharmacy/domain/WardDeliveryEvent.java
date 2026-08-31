package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "ward_delivery_events")
public class WardDeliveryEvent {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "delivery_id", nullable = false) private Long deliveryId;
    @Column(name = "event_type", nullable = false) private String eventType;
    @Column(name = "from_status") private String fromStatus;
    @Column(name = "to_status", nullable = false) private String toStatus;
    @Column(name = "command_code", nullable = false) private String commandCode;
    @Column(name = "occurred_at", nullable = false) private Instant occurredAt;
    @Column(name = "occurred_by", nullable = false) private Long occurredBy;
    @Column private String note;

    protected WardDeliveryEvent() {}

    public WardDeliveryEvent(Long tenantId, Long deliveryId, String eventType, String fromStatus,
                             String toStatus, String commandCode, Instant occurredAt, Long occurredBy, String note) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.deliveryId = deliveryId;
        this.eventType = eventType; this.fromStatus = fromStatus; this.toStatus = toStatus;
        this.commandCode = commandCode; this.occurredAt = occurredAt; this.occurredBy = occurredBy; this.note = note;
    }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public Long deliveryId() { return deliveryId; }
    public String eventType() { return eventType; }
    public String fromStatus() { return fromStatus; }
    public String toStatus() { return toStatus; }
    public String commandCode() { return commandCode; }
    public Instant occurredAt() { return occurredAt; }
    public Long occurredBy() { return occurredBy; }
    public String note() { return note; }
}
