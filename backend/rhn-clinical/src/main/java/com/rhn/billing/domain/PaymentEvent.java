package com.rhn.billing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "RHN_BIL_PAY_EVT")
public class PaymentEvent {
    @Id @Column(name = "ID_PAY_EVT") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_PAY_ORDER", nullable = false) private Long paymentOrderId;
    @Column(name = "ID_EXT_MSG") private Long externalMessageId;
    @Column(name = "SD_EVT_TYPE", nullable = false) private String eventType;
    @Column(name = "SD_STATUS_FROM") private String statusFrom;
    @Column(name = "SD_STATUS_TO", nullable = false) private String statusTo;
    @Column(name = "CD_COMMAND", nullable = false) private String commandCode;
    @Column(name = "CD_EXT_TXN_NO") private String externalTransactionNo;
    @Column(name = "AMT_EVT", precision = 24, scale = 6) private BigDecimal eventAmount;
    @Column(name = "CD_ERROR") private String errorCode;
    @Column(name = "DES_ERROR_MSG") private String errorMessage;
    @Column(name = "ID_ACTOR") private Long actorId;
    @Column(name = "DT_OCCRD", nullable = false) private Instant occurredAt;

    protected PaymentEvent() {}

    public PaymentEvent(Long tenantId, Long paymentOrderId, Long externalMessageId, String eventType,
                        String statusFrom, String statusTo, String commandCode, String externalTransactionNo,
                        BigDecimal eventAmount, String errorCode, String errorMessage, Long actorId) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.paymentOrderId = paymentOrderId;
        this.externalMessageId = externalMessageId; this.eventType = eventType; this.statusFrom = statusFrom;
        this.statusTo = statusTo; this.commandCode = commandCode; this.externalTransactionNo = externalTransactionNo;
        this.eventAmount = eventAmount; this.errorCode = errorCode; this.errorMessage = errorMessage;
        this.actorId = actorId; this.occurredAt = Instant.now();
    }

    public Long id() { return id; }
    public Long externalMessageId() { return externalMessageId; }
    public String eventType() { return eventType; }
    public String statusFrom() { return statusFrom; }
    public String statusTo() { return statusTo; }
    public String commandCode() { return commandCode; }
    public String externalTransactionNo() { return externalTransactionNo; }
    public BigDecimal eventAmount() { return eventAmount; }
    public String errorCode() { return errorCode; }
    public String errorMessage() { return errorMessage; }
    public Instant occurredAt() { return occurredAt; }
}
