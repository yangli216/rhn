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
@Table(name = "RHN_BIL_STL")
public class Settlement {
    @Id @Column(name = "ID_STL") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_ORG", nullable = false) private Long organizationId;
    @Column(name = "ID_DEPT", nullable = false) private Long departmentId;
    @Column(name = "ID_PAT_ACCT", nullable = false) private Long patientAccountId;
    @Column(name = "ID_STL_REVERSES") private Long reversesSettlementId;
    @Column(name = "ID_INVOICE_LEGACY") private Long legacyInvoiceId;
    @Column(name = "CD_STL_NO", nullable = false) private String settlementNo;
    @Column(name = "CD_COMMAND", nullable = false) private String commandCode;
    @Column(name = "SD_STL_TYPE", nullable = false) private String settlementType;
    @Column(name = "SD_STL_SCENE", nullable = false) private String settlementScene;
    @Column(name = "SD_TERMINAL_SCENE", nullable = false) private String terminalScene;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "AMT_GROSS", nullable = false, precision = 24, scale = 6) private BigDecimal grossAmount;
    @Column(name = "AMT_DISCOUNT", nullable = false, precision = 24, scale = 6) private BigDecimal discountAmount;
    @Column(name = "AMT_INS", nullable = false, precision = 24, scale = 6) private BigDecimal insuranceAmount;
    @Column(name = "AMT_PAT", nullable = false, precision = 24, scale = 6) private BigDecimal patientAmount;
    @Column(name = "AMT_OTHER", nullable = false, precision = 24, scale = 6) private BigDecimal otherAmount;
    @Column(name = "AMT_ROUNDING", nullable = false, precision = 24, scale = 6) private BigDecimal roundingAmount;
    @Column(name = "AMT_NET", nullable = false, precision = 24, scale = 6) private BigDecimal netAmount;
    @Column(name = "CD_CURRENCY", nullable = false) private String currencyCode;
    @Column(name = "CD_TERMINAL") private String terminalCode;
    @Column(name = "ID_USER_CREATED", nullable = false) private Long createdBy;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_FINALIZED") private Long finalizedBy;
    @Column(name = "DT_FINALIZED") private Instant finalizedAt;
    @Column(name = "CD_ERROR") private String errorCode;
    @Column(name = "DES_ERROR_MSG") private String errorMessage;

    protected Settlement() {}

    public Settlement(Long id, Long tenantId, Long patientAccountId, Long legacyInvoiceId,
                      String settlementNo, String commandCode, String settlementType,
                      String settlementScene, String terminalScene, BigDecimal amount,
                      String currencyCode, String terminalCode, Long createdBy, Instant createdAt) {
        this(id, tenantId, 1L, 1L, patientAccountId, legacyInvoiceId, settlementNo, commandCode,
                settlementType, settlementScene, terminalScene, amount, currencyCode, terminalCode,
                createdBy, createdAt);
    }

    public Settlement(Long id, Long tenantId, Long organizationId, Long departmentId,
                      Long patientAccountId, Long legacyInvoiceId,
                      String settlementNo, String commandCode, String settlementType,
                      String settlementScene, String terminalScene, BigDecimal amount,
                      String currencyCode, String terminalCode, Long createdBy, Instant createdAt) {
        this.id = id; this.tenantId = tenantId;
        this.organizationId = organizationId; this.departmentId = departmentId;
        this.patientAccountId = patientAccountId;
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

    public void applyRoundingAdjustment(BigDecimal adjustment) {
        if (adjustment == null) return;
        if (!List.of("PRICED", "PAYMENT_PENDING", "PARTIAL").contains(status)) {
            throw new IllegalStateException("当前结算状态不能应用货币舍入调整");
        }
        this.roundingAmount = adjustment.setScale(6, java.math.RoundingMode.HALF_UP);
        this.netAmount = this.grossAmount.add(this.roundingAmount).subtract(this.discountAmount).setScale(6, java.math.RoundingMode.HALF_UP);
        this.patientAmount = this.netAmount.subtract(this.insuranceAmount).subtract(this.otherAmount).abs().setScale(6, java.math.RoundingMode.HALF_UP);
    }

    private BigDecimal zero() { return BigDecimal.ZERO.setScale(6); }
    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long organizationId() { return organizationId; }
    public Long departmentId() { return departmentId; }
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
