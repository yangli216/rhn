package com.rhn.billing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "invoices")
public class Invoice {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "patient_account_id", nullable = false) private Long patientAccountId;
    @Column(name = "invoice_no", nullable = false) private String invoiceNo;
    @Column(name = "invoice_type", nullable = false) private String invoiceType;
    @Column(nullable = false) private String status;
    @Column(name = "currency_code", nullable = false) private String currencyCode;
    @Column(name = "gross_amount", nullable = false, precision = 24, scale = 6) private BigDecimal grossAmount;
    @Column(name = "discount_amount", nullable = false, precision = 24, scale = 6) private BigDecimal discountAmount;
    @Column(name = "net_amount", nullable = false, precision = 24, scale = 6) private BigDecimal netAmount;
    @Column(name = "issued_at", nullable = false) private Instant issuedAt;
    @Column(name = "issued_by", nullable = false) private Long issuedBy;
    @Column(name = "cancelled_at") private Instant cancelledAt;
    @Column(name = "cancellation_reason") private String cancellationReason;

    protected Invoice() {}

    public Invoice(Long tenantId, Long patientAccountId, String invoiceNo, String currencyCode,
                   BigDecimal amount, Instant issuedAt, Long issuedBy) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.patientAccountId = patientAccountId;
        this.invoiceNo = invoiceNo; this.invoiceType = amount.signum() >= 0 ? "STANDARD" : "CREDIT";
        this.status = "ISSUED"; this.currencyCode = currencyCode; this.grossAmount = amount;
        this.discountAmount = BigDecimal.ZERO; this.netAmount = amount; this.issuedAt = issuedAt;
        this.issuedBy = issuedBy;
    }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public Long patientAccountId() { return patientAccountId; }
    public String invoiceNo() { return invoiceNo; }
    public String invoiceType() { return invoiceType; }
    public String status() { return status; }
    public String currencyCode() { return currencyCode; }
    public BigDecimal grossAmount() { return grossAmount; }
    public BigDecimal discountAmount() { return discountAmount; }
    public BigDecimal netAmount() { return netAmount; }
    public Instant issuedAt() { return issuedAt; }
    public Long issuedBy() { return issuedBy; }
}
