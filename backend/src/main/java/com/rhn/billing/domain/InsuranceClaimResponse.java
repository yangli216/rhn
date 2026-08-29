package com.rhn.billing.domain;

import com.rhn.billing.api.InsuranceSettlementAdapter.InsuranceResult;
import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "insurance_claim_responses")
public class InsuranceClaimResponse {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "claim_id", nullable = false) private Long claimId;
    @Column(name = "external_message_id") private Long externalMessageId;
    @Column(name = "response_no", nullable = false) private String responseNo;
    @Column(name = "command_code", nullable = false) private String commandCode;
    @Column(nullable = false) private String operation;
    @Column(nullable = false) private String status;
    @Column(name = "external_settlement_no") private String externalSettlementNo;
    @Column(name = "insurance_fund_amount", nullable = false, precision = 24, scale = 6) private BigDecimal insuranceFundAmount;
    @Column(name = "personal_account_amount", nullable = false, precision = 24, scale = 6) private BigDecimal personalAccountAmount;
    @Column(name = "patient_cash_amount", nullable = false, precision = 24, scale = 6) private BigDecimal patientCashAmount;
    @Column(name = "other_fund_amount", nullable = false, precision = 24, scale = 6) private BigDecimal otherFundAmount;
    @Column(name = "error_code") private String errorCode;
    @Column(name = "error_message") private String errorMessage;
    @Column(name = "responded_at", nullable = false) private Instant respondedAt;

    protected InsuranceClaimResponse() {}
    public InsuranceClaimResponse(Long tenantId, Long claimId, Long externalMessageId, String commandCode,
                                  String operation, InsuranceResult result) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.claimId = claimId; this.externalMessageId = externalMessageId;
        this.responseNo = result.externalMessageBusinessId() == null ? "IR" + id : result.externalMessageBusinessId();
        this.commandCode = commandCode; this.operation = operation; this.status = result.outcome().name();
        this.externalSettlementNo = result.externalSettlementNo(); this.insuranceFundAmount = amount(result.insuranceFundAmount());
        this.personalAccountAmount = amount(result.personalAccountAmount()); this.patientCashAmount = amount(result.patientCashAmount());
        this.otherFundAmount = amount(result.otherFundAmount()); this.errorCode = result.errorCode();
        this.errorMessage = result.errorMessage(); this.respondedAt = Instant.now();
    }
    private BigDecimal amount(BigDecimal value) { return value == null ? BigDecimal.ZERO.setScale(6) : value.setScale(6); }
    public Long id() { return id; } public Long externalMessageId() { return externalMessageId; }
    public String responseNo() { return responseNo; } public String commandCode() { return commandCode; }
    public String operation() { return operation; } public String status() { return status; }
    public String externalSettlementNo() { return externalSettlementNo; } public BigDecimal insuranceFundAmount() { return insuranceFundAmount; }
    public BigDecimal personalAccountAmount() { return personalAccountAmount; } public BigDecimal patientCashAmount() { return patientCashAmount; }
    public BigDecimal otherFundAmount() { return otherFundAmount; } public String errorCode() { return errorCode; }
    public String errorMessage() { return errorMessage; } public Instant respondedAt() { return respondedAt; }
}
