package com.rhn.billing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "payments")
public class Payment {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "patient_account_id", nullable = false) private Long patientAccountId;
    @Column(name = "invoice_id") private Long invoiceId;
    @Column(name = "payment_no", nullable = false) private String paymentNo;
    @Column(name = "payment_type", nullable = false) private String paymentType;
    @Column(name = "payment_method_code", nullable = false) private String paymentMethodCode;
    @Column(nullable = false) private String status;
    @Column(nullable = false, precision = 24, scale = 6) private BigDecimal amount;
    @Column(name = "currency_code", nullable = false) private String currencyCode;
    @Column(name = "paid_at", nullable = false) private Instant paidAt;
    @Column(name = "external_transaction_no") private String externalTransactionNo;
    @Column(name = "reverses_payment_id") private Long reversesPaymentId;
    @Column(name = "entered_by", nullable = false) private Long enteredBy;
    @Column private String description;

    protected Payment() {}

    public Payment(Long tenantId, Long patientAccountId, Long invoiceId, String paymentNo, String paymentType,
                   String paymentMethodCode, BigDecimal amount, String currencyCode, Instant paidAt,
                   String externalTransactionNo, Long reversesPaymentId, Long enteredBy, String description) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.patientAccountId = patientAccountId;
        this.invoiceId = invoiceId; this.paymentNo = paymentNo; this.paymentType = paymentType;
        this.paymentMethodCode = paymentMethodCode; this.status = "COMPLETED"; this.amount = amount;
        this.currencyCode = currencyCode; this.paidAt = paidAt; this.externalTransactionNo = externalTransactionNo;
        this.reversesPaymentId = reversesPaymentId; this.enteredBy = enteredBy; this.description = description;
    }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public Long patientAccountId() { return patientAccountId; }
    public Long invoiceId() { return invoiceId; }
    public String paymentNo() { return paymentNo; }
    public String paymentType() { return paymentType; }
    public String paymentMethodCode() { return paymentMethodCode; }
    public String status() { return status; }
    public BigDecimal amount() { return amount; }
    public String currencyCode() { return currencyCode; }
    public Instant paidAt() { return paidAt; }
    public String externalTransactionNo() { return externalTransactionNo; }
    public Long reversesPaymentId() { return reversesPaymentId; }
    public Long enteredBy() { return enteredBy; }
    public String description() { return description; }
}
