package com.rhn.billing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "payment_orders")
public class PaymentOrder {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "patient_account_id", nullable = false) private Long patientAccountId;
    @Column(name = "invoice_id", nullable = false) private Long invoiceId;
    @Column(name = "original_payment_id") private Long originalPaymentId;
    @Column(name = "order_no", nullable = false) private String orderNo;
    @Column(name = "idempotency_key", nullable = false) private String idempotencyKey;
    @Column(name = "business_scene", nullable = false) private String businessScene;
    @Column(name = "payment_scene_code", nullable = false) private String paymentSceneCode;
    @Column(name = "payment_method_code", nullable = false) private String paymentMethodCode;
    @Column(name = "payment_method_name_snapshot", nullable = false) private String paymentMethodNameSnapshot;
    @Column(name = "order_type", nullable = false) private String orderType;
    @Column(nullable = false) private String status;
    @Column(name = "requested_amount", nullable = false, precision = 24, scale = 6) private BigDecimal requestedAmount;
    @Column(name = "captured_amount", nullable = false, precision = 24, scale = 6) private BigDecimal capturedAmount;
    @Column(name = "refunded_amount", nullable = false, precision = 24, scale = 6) private BigDecimal refundedAmount;
    @Column(name = "currency_code", nullable = false) private String currencyCode;
    @Column(name = "external_order_no") private String externalOrderNo;
    @Column(name = "correlation_id") private String correlationId;
    @Column(name = "terminal_code") private String terminalCode;
    @Column(name = "expires_at") private Instant expiresAt;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "created_by", nullable = false) private Long createdBy;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "error_code") private String errorCode;
    @Column(name = "error_message") private String errorMessage;

    protected PaymentOrder() {}

    public PaymentOrder(Long tenantId, Long patientAccountId, Long invoiceId, String orderNo,
                        String idempotencyKey, String businessScene, String paymentSceneCode,
                        String paymentMethodCode, String paymentMethodNameSnapshot, BigDecimal requestedAmount,
                        String currencyCode, String correlationId, String terminalCode, Instant expiresAt,
                        Long createdBy) {
        this(tenantId, patientAccountId, invoiceId, null, orderNo, idempotencyKey, businessScene,
                paymentSceneCode, paymentMethodCode, paymentMethodNameSnapshot, "SETTLEMENT_PAY",
                requestedAmount, currencyCode, correlationId, terminalCode, expiresAt, createdBy);
    }

    public PaymentOrder(Long tenantId, Long patientAccountId, Long invoiceId, Long originalPaymentId,
                        String orderNo, String idempotencyKey, String businessScene, String paymentSceneCode,
                        String paymentMethodCode, String paymentMethodNameSnapshot, String orderType,
                        BigDecimal requestedAmount, String currencyCode, String correlationId,
                        String terminalCode, Instant expiresAt, Long createdBy) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.patientAccountId = patientAccountId;
        this.invoiceId = invoiceId; this.originalPaymentId = originalPaymentId;
        this.orderNo = orderNo; this.idempotencyKey = idempotencyKey;
        this.businessScene = businessScene; this.paymentSceneCode = paymentSceneCode;
        this.paymentMethodCode = paymentMethodCode; this.paymentMethodNameSnapshot = paymentMethodNameSnapshot;
        this.orderType = orderType; this.status = "CREATED"; this.requestedAmount = requestedAmount;
        this.capturedAmount = BigDecimal.ZERO.setScale(6); this.refundedAmount = BigDecimal.ZERO.setScale(6);
        this.currencyCode = currencyCode; this.correlationId = correlationId; this.terminalCode = terminalCode;
        this.expiresAt = expiresAt; this.createdAt = Instant.now(); this.updatedAt = this.createdAt; this.createdBy = createdBy;
    }

    public void transition(String nextStatus, BigDecimal capturedAmount, String externalOrderNo,
                           String errorCode, String errorMessage) {
        this.status = nextStatus;
        if (capturedAmount != null) this.capturedAmount = capturedAmount;
        if (externalOrderNo != null && !externalOrderNo.isBlank()) this.externalOrderNo = externalOrderNo.trim();
        this.errorCode = errorCode; this.errorMessage = errorMessage; this.updatedAt = Instant.now();
    }

    public void transitionRefund(String nextStatus, BigDecimal refundedAmount, String externalOrderNo,
                                 String errorCode, String errorMessage) {
        this.status = nextStatus;
        if (refundedAmount != null) this.refundedAmount = refundedAmount;
        if (externalOrderNo != null && !externalOrderNo.isBlank()) this.externalOrderNo = externalOrderNo.trim();
        this.errorCode = errorCode; this.errorMessage = errorMessage; this.updatedAt = Instant.now();
    }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long patientAccountId() { return patientAccountId; }
    public Long invoiceId() { return invoiceId; }
    public Long originalPaymentId() { return originalPaymentId; }
    public String orderNo() { return orderNo; }
    public String idempotencyKey() { return idempotencyKey; }
    public String businessScene() { return businessScene; }
    public String paymentSceneCode() { return paymentSceneCode; }
    public String paymentMethodCode() { return paymentMethodCode; }
    public String paymentMethodNameSnapshot() { return paymentMethodNameSnapshot; }
    public String orderType() { return orderType; }
    public String status() { return status; }
    public BigDecimal requestedAmount() { return requestedAmount; }
    public BigDecimal capturedAmount() { return capturedAmount; }
    public BigDecimal refundedAmount() { return refundedAmount; }
    public String currencyCode() { return currencyCode; }
    public String externalOrderNo() { return externalOrderNo; }
    public String correlationId() { return correlationId; }
    public String terminalCode() { return terminalCode; }
    public Instant expiresAt() { return expiresAt; }
    public Instant createdAt() { return createdAt; }
    public Long createdBy() { return createdBy; }
    public Instant updatedAt() { return updatedAt; }
    public String errorCode() { return errorCode; }
    public String errorMessage() { return errorMessage; }
}
