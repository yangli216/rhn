package com.rhn.billing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "receipt_events")
public class ReceiptEvent {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "receipt_id", nullable = false) private Long receiptId;
    @Column(name = "external_message_id") private Long externalMessageId;
    @Column(name = "event_type", nullable = false) private String eventType;
    @Column(name = "status_from") private String statusFrom;
    @Column(name = "status_to", nullable = false) private String statusTo;
    @Column(name = "command_code", nullable = false) private String commandCode;
    @Column(name = "actor_id") private Long actorId;
    @Column(name = "error_code") private String errorCode;
    @Column(name = "action_reason") private String actionReason;
    @Column(name = "error_message") private String errorMessage;
    @Column(name = "occurred_at", nullable = false) private Instant occurredAt;

    protected ReceiptEvent() {}
    public ReceiptEvent(Long tenantId, Long receiptId, Long externalMessageId, String eventType,
                        String statusFrom, String statusTo, String commandCode, Long actorId,
                        String errorCode, String errorMessage) {
        this(tenantId, receiptId, externalMessageId, eventType, statusFrom, statusTo, commandCode,
                actorId, null, errorCode, errorMessage);
    }
    public ReceiptEvent(Long tenantId, Long receiptId, Long externalMessageId, String eventType,
                        String statusFrom, String statusTo, String commandCode, Long actorId,
                        String actionReason, String errorCode, String errorMessage) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.receiptId = receiptId;
        this.externalMessageId = externalMessageId; this.eventType = eventType; this.statusFrom = statusFrom;
        this.statusTo = statusTo; this.commandCode = commandCode; this.actorId = actorId;
        this.actionReason = actionReason; this.errorCode = errorCode; this.errorMessage = errorMessage;
        this.occurredAt = Instant.now();
    }
    public Long id() { return id; }
    public Long externalMessageId() { return externalMessageId; }
    public String eventType() { return eventType; }
    public String statusFrom() { return statusFrom; }
    public String statusTo() { return statusTo; }
    public String commandCode() { return commandCode; }
    public Long actorId() { return actorId; }
    public String errorCode() { return errorCode; }
    public String actionReason() { return actionReason; }
    public String errorMessage() { return errorMessage; }
    public Instant occurredAt() { return occurredAt; }
}
