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
    @Column(name = "AMT_INS_FUND", nullable = false, precision = 24, scale = 6) private BigDecimal insuranceFundAmount;
    @Column(name = "AMT_PERS_ACCT", nullable = false, precision = 24, scale = 6) private BigDecimal personalAccountAmount;
    @Column(name = "AMT_PAT_CASH", nullable = false, precision = 24, scale = 6) private BigDecimal patientCashAmount;
    @Column(name = "AMT_OTHER_FUND", nullable = false, precision = 24, scale = 6) private BigDecimal otherFundAmount;
    @Column(name = "CD_ERROR") private String errorCode;
    @Column(name = "DES_ERROR_MSG") private String errorMessage;
    @Column(name = "DT_RSPND", nullable = false) private Instant respondedAt;

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
