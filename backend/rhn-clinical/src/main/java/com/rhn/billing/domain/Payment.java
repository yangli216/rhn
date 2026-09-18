package com.rhn.billing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "RHN_BIL_PAY")
public class Payment {
    @Id @Column(name = "ID_PAY") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_ORG", nullable = false) private Long organizationId;
    @Column(name = "ID_DEPT", nullable = false) private Long departmentId;
    @Column(name = "ID_PAT_ACCT", nullable = false) private Long patientAccountId;
    @Column(name = "ID_INVOICE") private Long invoiceId;
    @Column(name = "ID_PAY_ORDER") private Long paymentOrderId;
    @Column(name = "CD_PAY_NO", nullable = false) private String paymentNo;
    @Column(name = "SD_PAY_TYPE", nullable = false) private String paymentType;
    @Column(name = "CD_PAY_METHOD", nullable = false) private String paymentMethodCode;
    @Column(name = "CD_PAY_SCENE") private String paymentSceneCode;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "AMT_PAYMENT", nullable = false, precision = 24, scale = 6) private BigDecimal amount;
    @Column(name = "CD_CURRENCY", nullable = false) private String currencyCode;
    @Column(name = "DT_PAID", nullable = false) private Instant paidAt;
    @Column(name = "CD_EXT_TXN_NO") private String externalTransactionNo;
    @Column(name = "ID_PAY_REVERSES") private Long reversesPaymentId;
    @Column(name = "ID_USER_ENTERED", nullable = false) private Long enteredBy;
    @Column(name = "DES_PAY") private String description;

    protected Payment() {}

    public Payment(Long tenantId, Long patientAccountId, Long invoiceId, String paymentNo, String paymentType,
                   String paymentMethodCode, BigDecimal amount, String currencyCode, Instant paidAt,
                   String externalTransactionNo, Long reversesPaymentId, Long enteredBy, String description) {
        this(tenantId, 1L, 1L, patientAccountId, invoiceId, null, paymentNo, paymentType, paymentMethodCode, null,
                amount, currencyCode, paidAt, externalTransactionNo, reversesPaymentId, enteredBy, description);
    }

    public Payment(Long tenantId, Long patientAccountId, Long invoiceId, Long paymentOrderId,
                   String paymentNo, String paymentType, String paymentMethodCode, String paymentSceneCode,
                   BigDecimal amount, String currencyCode, Instant paidAt, String externalTransactionNo,
                   Long reversesPaymentId, Long enteredBy, String description) {
        this(tenantId, 1L, 1L, patientAccountId, invoiceId, paymentOrderId,
                paymentNo, paymentType, paymentMethodCode, paymentSceneCode,
                amount, currencyCode, paidAt, externalTransactionNo, reversesPaymentId, enteredBy, description);
    }

    public Payment(Long tenantId, Long organizationId, Long departmentId,
                   Long patientAccountId, Long invoiceId, Long paymentOrderId,
                   String paymentNo, String paymentType, String paymentMethodCode, String paymentSceneCode,
                   BigDecimal amount, String currencyCode, Instant paidAt, String externalTransactionNo,
                   Long reversesPaymentId, Long enteredBy, String description) {
        this.id = GlobalIds.next(); this.tenantId = tenantId;
        this.organizationId = organizationId; this.departmentId = departmentId;
        this.patientAccountId = patientAccountId;
        this.invoiceId = invoiceId; this.paymentOrderId = paymentOrderId; this.paymentNo = paymentNo;
        this.paymentType = paymentType; this.paymentMethodCode = paymentMethodCode;
        this.paymentSceneCode = paymentSceneCode; this.status = "COMPLETED"; this.amount = amount;
        this.currencyCode = currencyCode; this.paidAt = paidAt; this.externalTransactionNo = externalTransactionNo;
        this.reversesPaymentId = reversesPaymentId; this.enteredBy = enteredBy; this.description = description;
    }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public Long organizationId() { return organizationId; }
    public Long departmentId() { return departmentId; }
    public Long patientAccountId() { return patientAccountId; }
    public Long invoiceId() { return invoiceId; }
    public Long paymentOrderId() { return paymentOrderId; }
    public String paymentNo() { return paymentNo; }
    public String paymentType() { return paymentType; }
    public String paymentMethodCode() { return paymentMethodCode; }
    public String paymentSceneCode() { return paymentSceneCode; }
    public String status() { return status; }
    public BigDecimal amount() { return amount; }
    public String currencyCode() { return currencyCode; }
    public Instant paidAt() { return paidAt; }
    public String externalTransactionNo() { return externalTransactionNo; }
    public Long reversesPaymentId() { return reversesPaymentId; }
    public Long enteredBy() { return enteredBy; }
    public String description() { return description; }
}
