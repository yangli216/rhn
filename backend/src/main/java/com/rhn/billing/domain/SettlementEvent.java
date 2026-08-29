package com.rhn.billing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "settlement_events")
public class SettlementEvent {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "settlement_id", nullable = false) private Long settlementId;
    @Column(name = "event_type", nullable = false) private String eventType;
    @Column(name = "status_from") private String statusFrom;
    @Column(name = "status_to", nullable = false) private String statusTo;
    @Column(name = "command_code", nullable = false) private String commandCode;
    @Column(name = "actor_id") private Long actorId;
    @Column(name = "error_code") private String errorCode;
    @Column(name = "error_message") private String errorMessage;
    @Column(name = "occurred_at", nullable = false) private Instant occurredAt;

    protected SettlementEvent() {}
    public SettlementEvent(Long tenantId, Long settlementId, String eventType, String statusFrom,
                           String statusTo, String commandCode, Long actorId, Instant occurredAt) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.settlementId = settlementId;
        this.eventType = eventType; this.statusFrom = statusFrom; this.statusTo = statusTo;
        this.commandCode = commandCode; this.actorId = actorId; this.occurredAt = occurredAt;
    }
    public Long id() { return id; } public String eventType() { return eventType; }
    public String statusFrom() { return statusFrom; } public String statusTo() { return statusTo; }
    public String commandCode() { return commandCode; } public Long actorId() { return actorId; }
    public String errorCode() { return errorCode; } public String errorMessage() { return errorMessage; }
    public Instant occurredAt() { return occurredAt; }
}
