package com.rhn.billing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "payment_events")
public class PaymentEvent {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "payment_order_id", nullable = false) private Long paymentOrderId;
    @Column(name = "external_message_id") private Long externalMessageId;
    @Column(name = "event_type", nullable = false) private String eventType;
    @Column(name = "status_from") private String statusFrom;
    @Column(name = "status_to", nullable = false) private String statusTo;
    @Column(name = "command_code", nullable = false) private String commandCode;
    @Column(name = "external_transaction_no") private String externalTransactionNo;
    @Column(name = "event_amount", precision = 24, scale = 6) private BigDecimal eventAmount;
    @Column(name = "error_code") private String errorCode;
    @Column(name = "error_message") private String errorMessage;
    @Column(name = "actor_id") private Long actorId;
    @Column(name = "occurred_at", nullable = false) private Instant occurredAt;

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
