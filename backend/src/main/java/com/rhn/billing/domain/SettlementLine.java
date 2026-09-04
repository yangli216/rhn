package com.rhn.billing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;

@Entity
@Table(name = "RHN_BIL_STL_LINE")
public class SettlementLine {
    @Id @Column(name = "ID_STL_LINE") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_STL", nullable = false) private Long settlementId;
    @Column(name = "ID_CHARGE_ITEM", nullable = false) private Long chargeItemId;
    @Column(name = "ID_INVOICE_LINE_LEGACY") private Long legacyInvoiceLineId;
    @Column(name = "SN_LINE", nullable = false) private int lineNo;
    @Column(name = "QTY_SETTLED", nullable = false, precision = 28, scale = 8) private BigDecimal settledQuantity;
    @Column(name = "AMT_GROSS", nullable = false, precision = 24, scale = 6) private BigDecimal grossAmount;
    @Column(name = "AMT_DISCOUNT", nullable = false, precision = 24, scale = 6) private BigDecimal discountAmount;
    @Column(name = "AMT_INS", nullable = false, precision = 24, scale = 6) private BigDecimal insuranceAmount;
    @Column(name = "AMT_PAT", nullable = false, precision = 24, scale = 6) private BigDecimal patientAmount;
    @Column(name = "AMT_OTHER", nullable = false, precision = 24, scale = 6) private BigDecimal otherAmount;
    @Column(name = "AMT_NET", nullable = false, precision = 24, scale = 6) private BigDecimal netAmount;

    protected SettlementLine() {}
    public SettlementLine(Long tenantId, Long settlementId, Long chargeItemId, Long legacyInvoiceLineId,
                          int lineNo, BigDecimal quantity, BigDecimal amount) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.settlementId = settlementId;
        this.chargeItemId = chargeItemId; this.legacyInvoiceLineId = legacyInvoiceLineId; this.lineNo = lineNo;
        this.settledQuantity = quantity; this.grossAmount = amount; this.discountAmount = zero();
        this.insuranceAmount = zero(); this.patientAmount = amount.abs(); this.otherAmount = zero();
        this.netAmount = amount;
    }
    public void applyAllocation(BigDecimal insurance, BigDecimal other) {
        if (insurance.signum() < 0 || other.signum() < 0 || insurance.add(other).compareTo(netAmount) > 0) {
            throw new IllegalArgumentException("结算行资金分摊不正确");
        }
        this.insuranceAmount = insurance; this.otherAmount = other;
        this.patientAmount = netAmount.subtract(insurance).subtract(other);
    }
    private BigDecimal zero() { return BigDecimal.ZERO.setScale(6); }
    public Long id() { return id; } public Long settlementId() { return settlementId; }
    public Long chargeItemId() { return chargeItemId; } public int lineNo() { return lineNo; }
    public BigDecimal settledQuantity() { return settledQuantity; } public BigDecimal grossAmount() { return grossAmount; }
    public BigDecimal discountAmount() { return discountAmount; } public BigDecimal insuranceAmount() { return insuranceAmount; }
    public BigDecimal patientAmount() { return patientAmount; } public BigDecimal otherAmount() { return otherAmount; }
    public BigDecimal netAmount() { return netAmount; }
}
