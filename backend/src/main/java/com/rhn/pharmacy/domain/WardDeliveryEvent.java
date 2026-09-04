package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "RHN_SUP_WARD_DELIV_EVT")
public class WardDeliveryEvent {
    @Id @Column(name = "ID_WARD_DELIV_EVT") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_WARD_DELIV", nullable = false) private Long deliveryId;
    @Column(name = "SD_EVT_TYPE", nullable = false) private String eventType;
    @Column(name = "SD_FROM_STATUS") private String fromStatus;
    @Column(name = "SD_TO_STATUS", nullable = false) private String toStatus;
    @Column(name = "CD_COMMAND", nullable = false) private String commandCode;
    @Column(name = "DT_OCCURRED", nullable = false) private Instant occurredAt;
    @Column(name = "ID_USER_OCCURRED", nullable = false) private Long occurredBy;
    @Column(name = "DES_NOTE") private String note;

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
