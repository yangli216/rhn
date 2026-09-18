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
@Table(name = "RHN_BIL_PAY_ORDER")
public class PaymentOrder {
    @Id @Column(name = "ID_PAY_ORDER") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_ORG", nullable = false) private Long organizationId;
    @Column(name = "ID_DEPT", nullable = false) private Long departmentId;
    @Column(name = "ID_PAT_ACCT", nullable = false) private Long patientAccountId;
    @Column(name = "ID_INVOICE", nullable = false) private Long invoiceId;
    @Column(name = "ID_PAY_ORIGINAL") private Long originalPaymentId;
    @Column(name = "CD_ORDER_NO", nullable = false) private String orderNo;
    @Column(name = "CD_IDEMP_KEY", nullable = false) private String idempotencyKey;
    @Column(name = "SD_BUSINESS_SCENE", nullable = false) private String businessScene;
    @Column(name = "CD_PAY_SCENE", nullable = false) private String paymentSceneCode;
    @Column(name = "CD_PAY_METHOD", nullable = false) private String paymentMethodCode;
    @Column(name = "NA_PAY_METHOD_SNAP", nullable = false) private String paymentMethodNameSnapshot;
    @Column(name = "SD_ORDER_TYPE", nullable = false) private String orderType;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "AMT_REQUESTED", nullable = false, precision = 24, scale = 6) private BigDecimal requestedAmount;
    @Column(name = "AMT_CAPTURED", nullable = false, precision = 24, scale = 6) private BigDecimal capturedAmount;
    @Column(name = "AMT_REFUNDED", nullable = false, precision = 24, scale = 6) private BigDecimal refundedAmount;
    @Column(name = "CD_CURRENCY", nullable = false) private String currencyCode;
    @Column(name = "CD_EXT_ORDER_NO") private String externalOrderNo;
    @Column(name = "ID_CORRELATION") private String correlationId;
    @Column(name = "CD_TERMINAL") private String terminalCode;
    @Column(name = "DT_EXPIRES") private Instant expiresAt;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED", nullable = false) private Long createdBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "CD_ERROR") private String errorCode;
    @Column(name = "DES_ERROR_MSG") private String errorMessage;

    protected PaymentOrder() {}

    public PaymentOrder(Long tenantId, Long patientAccountId, Long invoiceId, String orderNo,
                        String idempotencyKey, String businessScene, String paymentSceneCode,
                        String paymentMethodCode, String paymentMethodNameSnapshot, BigDecimal requestedAmount,
                        String currencyCode, String correlationId, String terminalCode, Instant expiresAt,
                        Long createdBy) {
        this(tenantId, 1L, 1L, patientAccountId, invoiceId, null, orderNo, idempotencyKey, businessScene,
                paymentSceneCode, paymentMethodCode, paymentMethodNameSnapshot, "SETTLEMENT_PAY",
                requestedAmount, currencyCode, correlationId, terminalCode, expiresAt, createdBy);
    }

    public PaymentOrder(Long tenantId, Long patientAccountId, Long invoiceId, Long originalPaymentId,
                        String orderNo, String idempotencyKey, String businessScene, String paymentSceneCode,
                        String paymentMethodCode, String paymentMethodNameSnapshot, String orderType,
                        BigDecimal requestedAmount, String currencyCode, String correlationId,
                        String terminalCode, Instant expiresAt, Long createdBy) {
        this(tenantId, 1L, 1L, patientAccountId, invoiceId, originalPaymentId, orderNo, idempotencyKey,
                businessScene, paymentSceneCode, paymentMethodCode, paymentMethodNameSnapshot, orderType,
                requestedAmount, currencyCode, correlationId, terminalCode, expiresAt, createdBy);
    }

    public PaymentOrder(Long tenantId, Long organizationId, Long departmentId,
                        Long patientAccountId, Long invoiceId, Long originalPaymentId,
                        String orderNo, String idempotencyKey, String businessScene, String paymentSceneCode,
                        String paymentMethodCode, String paymentMethodNameSnapshot, String orderType,
                        BigDecimal requestedAmount, String currencyCode, String correlationId,
                        String terminalCode, Instant expiresAt, Long createdBy) {
        this.id = GlobalIds.next(); this.tenantId = tenantId;
        this.organizationId = organizationId; this.departmentId = departmentId;
        this.patientAccountId = patientAccountId;
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
    public Long organizationId() { return organizationId; }
    public Long departmentId() { return departmentId; }
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
