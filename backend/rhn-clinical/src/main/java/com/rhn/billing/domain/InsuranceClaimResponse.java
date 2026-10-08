package com.rhn.billing.domain;

import com.rhn.billing.api.InsuranceSettlementAdapter.InsuranceResult;
import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Objects;

@Entity
@Table(name = "RHN_INS_CLAIM_RESP")
public class InsuranceClaimResponse {
    @Id @Column(name = "ID_CLAIM_RESP") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_INS_CLAIM", nullable = false) private Long claimId;
    @Column(name = "ID_EXT_MSG") private Long externalMessageId;
    @Column(name = "CD_RESP_NO", nullable = false) private String responseNo;
    @Column(name = "CD_COMMAND", nullable = false) private String commandCode;
    @Column(name = "SD_OPER", nullable = false) private String operation;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "CD_EXT_STL_NO") private String externalSettlementNo;
    @Column(name = "AMT_INS_FUND", precision = 24, scale = 6) private BigDecimal insuranceFundAmount;
    @Column(name = "AMT_PERS_ACCT", precision = 24, scale = 6) private BigDecimal personalAccountAmount;
    @Column(name = "AMT_PAT_CASH", precision = 24, scale = 6) private BigDecimal patientCashAmount;
    @Column(name = "AMT_OTHER_FUND", precision = 24, scale = 6) private BigDecimal otherFundAmount;
    @Column(name = "SD_AMT_SRC", nullable = false) private String amountSource;
    @Column(name = "CD_ERROR") private String errorCode;
    @Column(name = "DES_ERROR_MSG") private String errorMessage;
    @Column(name = "DT_RSPND", nullable = false) private Instant respondedAt;

    protected InsuranceClaimResponse() {}
    public InsuranceClaimResponse(Long tenantId, Long claimId, Long externalMessageId, String commandCode,
                                  String operation, InsuranceResult result) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.claimId = claimId; this.externalMessageId = externalMessageId;
        this.responseNo = text(result.externalMessageBusinessId()) == null ? "IR" + id : text(result.externalMessageBusinessId());
        this.commandCode = commandCode; this.operation = operation; this.status = result.outcome().name();
        this.amountSource = "REPORTED";
        this.externalSettlementNo = result.externalSettlementNo(); this.insuranceFundAmount = amount(result.insuranceFundAmount());
        this.personalAccountAmount = amount(result.personalAccountAmount()); this.patientCashAmount = amount(result.patientCashAmount());
        this.otherFundAmount = amount(result.otherFundAmount()); this.errorCode = result.errorCode();
        this.errorMessage = result.errorMessage(); this.respondedAt = Instant.now();
    }
    private BigDecimal amount(BigDecimal value) {
        if (value == null) {
            if ("SUCCEEDED".equals(status)) throw new IllegalStateException("成功医保回执缺少明确金额");
            return null;
        }
        if (value.signum() < 0) throw new IllegalStateException("医保回执金额不能为负数");
        return value.setScale(6, java.math.RoundingMode.UNNECESSARY);
    }
    /** Message identifiers may change on redelivery; the business result must not. */
    public boolean matches(String expectedOperation, InsuranceResult result, String claimCurrency) {
        if (!hasReportedAmounts() || result == null || result.outcome() == null || !operation.equals(expectedOperation)
                || !status.equals(result.outcome().name())
                || !Objects.equals(text(externalSettlementNo), text(result.externalSettlementNo()))
                || !Objects.equals(text(errorCode), text(result.errorCode()))) return false;
        if (result.outcome() == InsuranceResult.Outcome.SUCCEEDED) {
            if (!Objects.equals(claimCurrency, result.currencyCode()) || text(result.externalSettlementNo()) == null
                    || text(result.errorCode()) != null || result.insuranceFundAmount() == null
                    || result.personalAccountAmount() == null || result.patientCashAmount() == null
                    || result.otherFundAmount() == null) return false;
        } else if (!Objects.equals(errorMessage, result.errorMessage())) return false;
        try {
            return sameAmount(insuranceFundAmount, amount(result.insuranceFundAmount()))
                    && sameAmount(personalAccountAmount, amount(result.personalAccountAmount()))
                    && sameAmount(patientCashAmount, amount(result.patientCashAmount()))
                    && sameAmount(otherFundAmount, amount(result.otherFundAmount()));
        } catch (ArithmeticException | IllegalStateException exception) { return false; }
    }
    private boolean sameAmount(BigDecimal first, BigDecimal second) {
        return first == null || second == null ? first == second : first.compareTo(second) == 0;
    }
    public boolean hasReportedAmounts() { return "REPORTED".equals(amountSource); }
    public String amountSource() { return hasReportedAmounts() ? "REPORTED" : "LEGACY_UNVERIFIED"; }
    private String text(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    public Long id() { return id; } public Long externalMessageId() { return externalMessageId; }
    public String responseNo() { return responseNo; } public String commandCode() { return commandCode; }
    public String operation() { return operation; } public String status() { return status; }
    public String externalSettlementNo() { return externalSettlementNo; } public BigDecimal insuranceFundAmount() { return hasReportedAmounts() ? insuranceFundAmount : null; }
    public BigDecimal personalAccountAmount() { return hasReportedAmounts() ? personalAccountAmount : null; } public BigDecimal patientCashAmount() { return hasReportedAmounts() ? patientCashAmount : null; }
    public BigDecimal otherFundAmount() { return hasReportedAmounts() ? otherFundAmount : null; } public String errorCode() { return errorCode; }
    public String errorMessage() { return errorMessage; } public Instant respondedAt() { return respondedAt; }
}
