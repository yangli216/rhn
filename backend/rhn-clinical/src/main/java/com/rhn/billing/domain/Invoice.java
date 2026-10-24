package com.rhn.billing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "RHN_BIL_INVOICE")
public class Invoice {
    @Id @Column(name = "ID_INVOICE") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_ORG", nullable = false) private Long organizationId;
    @Column(name = "ID_DEPT", nullable = false) private Long departmentId;
    @Column(name = "ID_PAT_ACCT", nullable = false) private Long patientAccountId;
    @Column(name = "CD_INVOICE_NO", nullable = false) private String invoiceNo;
    @Column(name = "SD_INVOICE_TYPE", nullable = false) private String invoiceType;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "CD_CCY", nullable = false) private String currencyCode;
    @Column(name = "AMT_GROSS", nullable = false, precision = 24, scale = 6) private BigDecimal grossAmount;
    @Column(name = "AMT_DISC", nullable = false, precision = 24, scale = 6) private BigDecimal discountAmount;
    @Column(name = "AMT_NET", nullable = false, precision = 24, scale = 6) private BigDecimal netAmount;
    @Column(name = "DT_ISSUED", nullable = false) private Instant issuedAt;
    @Column(name = "ID_USER_ISSUED", nullable = false) private Long issuedBy;
    @Column(name = "DT_CNCLD") private Instant cancelledAt;
    @Column(name = "DES_CNCLN_REASON") private String cancellationReason;

    @Column(name = "CD_CMD", nullable = false) private String commandCode;

    protected Invoice() {}

    public Invoice(Long tenantId, Long patientAccountId, String invoiceNo, String currencyCode,
                   BigDecimal amount, Instant issuedAt, Long issuedBy) {
        this(tenantId, 1L, 1L, patientAccountId, invoiceNo, currencyCode, amount, issuedAt, issuedBy);
    }

    public Invoice(Long tenantId, Long organizationId, Long departmentId,
                   Long patientAccountId, String invoiceNo, String currencyCode,
                   BigDecimal amount, Instant issuedAt, Long issuedBy) {
        this(tenantId, organizationId, departmentId, patientAccountId, invoiceNo, currencyCode, amount, issuedAt, issuedBy, invoiceNo);
    }

    public Invoice(Long tenantId, Long organizationId, Long departmentId,
                   Long patientAccountId, String invoiceNo, String currencyCode,
                   BigDecimal amount, Instant issuedAt, Long issuedBy, String commandCode) {
        this.commandCode = commandCode;
        this.id = GlobalIds.next(); this.tenantId = tenantId;
        this.organizationId = organizationId; this.departmentId = departmentId;
        this.patientAccountId = patientAccountId;
        this.invoiceNo = invoiceNo; this.invoiceType = amount.signum() >= 0 ? "STANDARD" : "CREDIT";
        this.status = "ISSUED"; this.currencyCode = currencyCode; this.grossAmount = amount;
        this.discountAmount = BigDecimal.ZERO; this.netAmount = amount; this.issuedAt = issuedAt;
        this.issuedBy = issuedBy;
    }

    /** 医保前减免同步到账单，收款按减免后的净额计算。 */
    public void applyDiscount(BigDecimal amount) {
        if (amount.signum() <= 0 || !"STANDARD".equals(invoiceType)) throw new IllegalArgumentException("账单减免金额不正确");
        BigDecimal rounding = this.netAmount.subtract(this.grossAmount).add(this.discountAmount);
        this.discountAmount = this.discountAmount.add(amount);
        this.netAmount = this.grossAmount.add(rounding).subtract(this.discountAmount).setScale(6, java.math.RoundingMode.HALF_UP);
    }

    /** 贷项账单冲回医保前减免，冲减金额只包含实际收取部分。 */
    public void applyDiscountReversal(BigDecimal amount) {
        if (amount.signum() <= 0 || !"CREDIT".equals(invoiceType)) throw new IllegalArgumentException("贷项账单冲回金额不正确");
        BigDecimal rounding = this.netAmount.subtract(this.grossAmount).add(this.discountAmount);
        this.discountAmount = this.discountAmount.subtract(amount);
        this.netAmount = this.grossAmount.add(rounding).subtract(this.discountAmount).setScale(6, java.math.RoundingMode.HALF_UP);
    }

    public void adjustRounding(BigDecimal adjustment) {
        if (adjustment == null) return;
        this.netAmount = this.grossAmount.add(adjustment).subtract(this.discountAmount).setScale(6, java.math.RoundingMode.HALF_UP);
    }

    /** 舍入随支付指令失败回退：结算凭证净额恢复为 毛额 − 减免。 */
    public void revertRounding() { adjustRounding(BigDecimal.ZERO); }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public Long organizationId() { return organizationId; }
    public Long departmentId() { return departmentId; }
    public Long patientAccountId() { return patientAccountId; }
    public String commandCode() { return commandCode; }
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
