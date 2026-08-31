package com.rhn.billing.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

@Entity
@Table(name = "settlements")
public class Settlement {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "patient_account_id", nullable = false) private Long patientAccountId;
    @Column(name = "reverses_settlement_id") private Long reversesSettlementId;
    @Column(name = "legacy_invoice_id") private Long legacyInvoiceId;
    @Column(name = "settlement_no", nullable = false) private String settlementNo;
    @Column(name = "command_code", nullable = false) private String commandCode;
    @Column(name = "settlement_type", nullable = false) private String settlementType;
    @Column(name = "settlement_scene", nullable = false) private String settlementScene;
    @Column(name = "terminal_scene", nullable = false) private String terminalScene;
    @Column(nullable = false) private String status;
    @Column(name = "gross_amount", nullable = false, precision = 24, scale = 6) private BigDecimal grossAmount;
    @Column(name = "discount_amount", nullable = false, precision = 24, scale = 6) private BigDecimal discountAmount;
    @Column(name = "insurance_amount", nullable = false, precision = 24, scale = 6) private BigDecimal insuranceAmount;
    @Column(name = "patient_amount", nullable = false, precision = 24, scale = 6) private BigDecimal patientAmount;
    @Column(name = "other_amount", nullable = false, precision = 24, scale = 6) private BigDecimal otherAmount;
    @Column(name = "rounding_amount", nullable = false, precision = 24, scale = 6) private BigDecimal roundingAmount;
    @Column(name = "net_amount", nullable = false, precision = 24, scale = 6) private BigDecimal netAmount;
    @Column(name = "currency_code", nullable = false) private String currencyCode;
    @Column(name = "terminal_code") private String terminalCode;
    @Column(name = "created_by", nullable = false) private Long createdBy;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "finalized_by") private Long finalizedBy;
    @Column(name = "finalized_at") private Instant finalizedAt;
    @Column(name = "error_code") private String errorCode;
    @Column(name = "error_message") private String errorMessage;

    protected Settlement() {}

    public Settlement(Long id, Long tenantId, Long patientAccountId, Long legacyInvoiceId,
                      String settlementNo, String commandCode, String settlementType,
                      String settlementScene, String terminalScene, BigDecimal amount,
                      String currencyCode, String terminalCode, Long createdBy, Instant createdAt) {
        this.id = id; this.tenantId = tenantId; this.patientAccountId = patientAccountId;
        this.legacyInvoiceId = legacyInvoiceId; this.settlementNo = settlementNo; this.commandCode = commandCode;
        this.settlementType = settlementType; this.settlementScene = settlementScene;
        this.terminalScene = terminalScene; this.status = "PRICED"; this.grossAmount = amount;
        this.discountAmount = zero(); this.insuranceAmount = zero(); this.patientAmount = amount.abs();
        this.otherAmount = zero(); this.roundingAmount = zero(); this.netAmount = amount;
        this.currencyCode = currencyCode; this.terminalCode = terminalCode;
        this.createdBy = createdBy; this.createdAt = createdAt;
    }

    public String applyPaidAmount(BigDecimal paidAmount, Long actorId, Instant occurredAt) {
        if ("REVERSAL".equals(settlementType) || "REVERSED".equals(status)) return status;
        String previous = status;
        if (netAmount.signum() == 0) {
            status = "SETTLED"; finalizedBy = actorId; finalizedAt = occurredAt;
        }
        else if (paidAmount.signum() <= 0) status = "PRICED";
        else if (paidAmount.compareTo(netAmount) < 0) status = "PARTIAL";
        else {
            status = "SETTLED"; finalizedBy = actorId; finalizedAt = occurredAt;
        }
        errorCode = null; errorMessage = null;
        return previous;
    }

    public void applyInsuranceAllocation(BigDecimal insuranceFund, BigDecimal personalAccount,
                                         BigDecimal patientCash, BigDecimal otherFund) {
        if (!List.of("PRICED", "PAYMENT_PENDING", "PARTIAL").contains(status)) {
            throw new IllegalStateException("当前结算状态不能应用医保分摊");
        }
        BigDecimal total = insuranceFund.add(personalAccount).add(patientCash).add(otherFund);
        if (total.compareTo(netAmount) != 0) throw new IllegalStateException("医保资金分摊合计与结算净额不一致");
        this.insuranceAmount = insuranceFund; this.patientAmount = personalAccount.add(patientCash);
        this.otherAmount = otherFund;
    }

    public void reverseInsuranceAllocation() {
        if (!List.of("SETTLED", "PARTIAL").contains(status)) {
            throw new IllegalStateException("当前结算状态不能冲正医保分摊");
        }
        this.insuranceAmount = zero(); this.otherAmount = zero(); this.patientAmount = netAmount.abs();
    }

    public String requestPayment() {
        String previous = status;
        if ("PRICED".equals(status)) status = "PAYMENT_PENDING";
        return previous;
    }

    private BigDecimal zero() { return BigDecimal.ZERO.setScale(6); }
    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long patientAccountId() { return patientAccountId; }
    public Long reversesSettlementId() { return reversesSettlementId; }
    public Long legacyInvoiceId() { return legacyInvoiceId; }
    public String settlementNo() { return settlementNo; }
    public String commandCode() { return commandCode; }
    public String settlementType() { return settlementType; }
    public String settlementScene() { return settlementScene; }
    public String terminalScene() { return terminalScene; }
    public String status() { return status; }
    public BigDecimal grossAmount() { return grossAmount; }
    public BigDecimal discountAmount() { return discountAmount; }
    public BigDecimal insuranceAmount() { return insuranceAmount; }
    public BigDecimal patientAmount() { return patientAmount; }
    public BigDecimal otherAmount() { return otherAmount; }
    public BigDecimal roundingAmount() { return roundingAmount; }
    public BigDecimal netAmount() { return netAmount; }
    public String currencyCode() { return currencyCode; }
    public String terminalCode() { return terminalCode; }
    public Long createdBy() { return createdBy; }
    public Instant createdAt() { return createdAt; }
    public Long finalizedBy() { return finalizedBy; }
    public Instant finalizedAt() { return finalizedAt; }
    public String errorCode() { return errorCode; }
    public String errorMessage() { return errorMessage; }
}
