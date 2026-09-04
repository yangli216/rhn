package com.rhn.billing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "RHN_BIL_RCPT_EVT")
public class ReceiptEvent {
    @Id @Column(name = "ID_RCPT_EVT") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_RCPT", nullable = false) private Long receiptId;
    @Column(name = "ID_EXT_MSG") private Long externalMessageId;
    @Column(name = "SD_EVT_TYPE", nullable = false) private String eventType;
    @Column(name = "SD_STATUS_FROM") private String statusFrom;
    @Column(name = "SD_STATUS_TO", nullable = false) private String statusTo;
    @Column(name = "CD_COMMAND", nullable = false) private String commandCode;
    @Column(name = "ID_ACTOR") private Long actorId;
    @Column(name = "CD_ERROR") private String errorCode;
    @Column(name = "DES_ACTION_REASON") private String actionReason;
    @Column(name = "DES_ERROR_MSG") private String errorMessage;
    @Column(name = "DT_OCCURRED", nullable = false) private Instant occurredAt;

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
