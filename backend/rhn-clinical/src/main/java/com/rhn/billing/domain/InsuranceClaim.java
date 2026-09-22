package com.rhn.billing.domain;

import com.rhn.billing.api.InsuranceSettlementAdapter.InsuranceResult;
import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "RHN_INS_CLAIM")
public class InsuranceClaim {
    @Id @Column(name = "ID_INS_CLAIM") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_STL", nullable = false) private Long settlementId;
    @Column(name = "ID_PAT_ACCT", nullable = false) private Long patientAccountId;
    @Column(name = "ID_PAT_COVER", nullable = false) private Long coverageId;
    @Column(name = "CD_CLAIM_NO", nullable = false) private String claimNo;
    @Column(name = "CD_COMMAND", nullable = false) private String commandCode;
    @Column(name = "SD_CLAIM_TYPE", nullable = false) private String claimType;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "SD_CURRENT_OPER", nullable = false) private String currentOperation;
    @Column(name = "CD_REGION", nullable = false) private String regionCode;
    @Column(name = "CD_INS_TYPE", nullable = false) private String insuranceTypeCode;
    @Column(name = "NA_PAYER_SNAP", nullable = false) private String payerNameSnapshot;
    @Column(name = "CD_ORG", nullable = false) private String organizationCode;
    @Column(name = "CD_DEPT", nullable = false) private String departmentCode;
    @Column(name = "CD_PRACT", nullable = false) private String practitionerCode;
    @Column(name = "HASH_DIAG_PAYLOAD", nullable = false) private String diagnosisPayloadDigest;
    @Column(name = "DT_SVC_STARTED", nullable = false) private Instant serviceStartedAt;
    @Column(name = "DT_SVC_ENDED") private Instant serviceEndedAt;
    @Column(name = "CD_EXT_PRE_STL_NO") private String externalPreSettlementNo;
    @Column(name = "CD_EXT_STL_NO") private String externalSettlementNo;
    @Column(name = "AMT_GROSS", nullable = false, precision = 24, scale = 6) private BigDecimal grossAmount;
    @Column(name = "AMT_INS_FUND", nullable = false, precision = 24, scale = 6) private BigDecimal insuranceFundAmount;
    @Column(name = "AMT_PERS_ACCT", nullable = false, precision = 24, scale = 6) private BigDecimal personalAccountAmount;
    @Column(name = "AMT_PAT_CASH", nullable = false, precision = 24, scale = 6) private BigDecimal patientCashAmount;
    @Column(name = "AMT_OTHER_FUND", nullable = false, precision = 24, scale = 6) private BigDecimal otherFundAmount;
    @Column(name = "CD_CCY", nullable = false) private String currencyCode;
    @Column(name = "ID_CORR") private String correlationId;
    @Column(name = "DES_RVRSL_REASON") private String reversalReason;
    @Column(name = "DT_RVRSD") private Instant reversedAt;
    @Column(name = "ID_USER_CREATED", nullable = false) private Long createdBy;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "CD_ERROR") private String errorCode;
    @Column(name = "DES_ERROR_MSG") private String errorMessage;

    protected InsuranceClaim() {}

    public InsuranceClaim(Long tenantId, Long settlementId, Long patientAccountId, Long coverageId,
                          String commandCode, String regionCode, String insuranceTypeCode, String payerName,
                          String organizationCode, String departmentCode, String practitionerCode,
                          String diagnosisPayloadDigest, Instant serviceStartedAt, Instant serviceEndedAt,
                          BigDecimal grossAmount, String currencyCode, String correlationId, Long createdBy) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.settlementId = settlementId;
        this.patientAccountId = patientAccountId; this.coverageId = coverageId; this.claimNo = "IC" + id;
        this.commandCode = commandCode; this.claimType = "NORMAL"; this.status = "PRE_SETTLEMENT_PENDING";
        this.currentOperation = "PRE_SETTLE"; this.regionCode = regionCode; this.insuranceTypeCode = insuranceTypeCode;
        this.payerNameSnapshot = payerName; this.organizationCode = organizationCode;
        this.departmentCode = departmentCode; this.practitionerCode = practitionerCode;
        this.diagnosisPayloadDigest = diagnosisPayloadDigest; this.serviceStartedAt = serviceStartedAt;
        this.serviceEndedAt = serviceEndedAt; this.grossAmount = grossAmount; this.currencyCode = currencyCode;
        this.correlationId = correlationId; this.createdBy = createdBy; this.createdAt = Instant.now();
        this.updatedAt = createdAt; this.insuranceFundAmount = zero(); this.personalAccountAmount = zero();
        this.patientCashAmount = grossAmount; this.otherFundAmount = zero();
    }

    public void prepareSettlement() {
        if (!"PRE_SETTLED".equals(status) && !("FAILED".equals(status) && "SETTLE".equals(currentOperation))) {
            throw new IllegalStateException("医保申请尚未完成预结算");
        }
        currentOperation = "SETTLE"; status = "SETTLEMENT_PENDING"; errorCode = null; errorMessage = null;
        updatedAt = Instant.now();
    }

    public void prepareReversal(String reason) {
        String value = reason == null ? null : reason.trim();
        if (value == null || value.isBlank()) throw new IllegalStateException("医保冲正原因不能为空");
        if (value.length() > 500) throw new IllegalStateException("医保冲正原因不能超过 500 个字符");
        if ("REVERSAL_PENDING".equals(status)) {
            if (!value.equals(reversalReason)) throw new IllegalStateException("医保冲正重试原因与原申请不一致");
            return;
        }
        if (!("SETTLED".equals(status) || ("FAILED".equals(status) && "REVERSE".equals(currentOperation)))) {
            throw new IllegalStateException("只有已结算医保申请可以冲正");
        }
        currentOperation = "REVERSE"; status = "REVERSAL_PENDING"; reversalReason = value;
        errorCode = null; errorMessage = null; updatedAt = Instant.now();
    }

    public String apply(String operation, InsuranceResult result) {
        if (!operation.equals(currentOperation) && !"QUERY".equals(operation)) {
            throw new IllegalStateException("医保结果操作类型与当前申请阶段不一致");
        }
        String effective = "QUERY".equals(operation) ? currentOperation : operation;
        String previous = status;
        BigDecimal fund = amount(result.insuranceFundAmount());
        BigDecimal personal = amount(result.personalAccountAmount());
        BigDecimal patient = amount(result.patientCashAmount());
        BigDecimal other = amount(result.otherFundAmount());
        if (result.outcome() == InsuranceResult.Outcome.SUCCEEDED
                && fund.add(personal).add(patient).add(other).compareTo(grossAmount) != 0) {
            throw new IllegalStateException("医保资金分摊合计与结算总额不一致");
        }
        if (result.outcome() == InsuranceResult.Outcome.SUCCEEDED && "REVERSE".equals(effective)
                && (fund.compareTo(insuranceFundAmount) != 0
                || personal.compareTo(personalAccountAmount) != 0
                || patient.compareTo(patientCashAmount) != 0
                || other.compareTo(otherFundAmount) != 0)) {
            throw new IllegalStateException("医保冲正资金分摊与原结算结果不一致");
        }
        if (result.outcome() == InsuranceResult.Outcome.SUCCEEDED) {
            insuranceFundAmount = fund; personalAccountAmount = personal; patientCashAmount = patient; otherFundAmount = other;
            if ("PRE_SETTLE".equals(effective)) {
                externalPreSettlementNo = sameOrSet(externalPreSettlementNo, result.externalSettlementNo());
                status = "PRE_SETTLED";
            } else if ("SETTLE".equals(effective)) {
                externalSettlementNo = sameOrSet(externalSettlementNo, result.externalSettlementNo());
                status = "SETTLED";
            } else if ("REVERSE".equals(effective)) {
                status = "REVERSED"; reversedAt = Instant.now();
            }
            errorCode = null; errorMessage = null;
        } else if (result.outcome() == InsuranceResult.Outcome.PENDING) {
            if (result.externalSettlementNo() != null) {
                if ("PRE_SETTLE".equals(effective)) externalPreSettlementNo = sameOrSet(externalPreSettlementNo, result.externalSettlementNo());
                else externalSettlementNo = sameOrSet(externalSettlementNo, result.externalSettlementNo());
            }
            status = switch (effective) {
                case "PRE_SETTLE" -> "PRE_SETTLEMENT_PENDING";
                case "SETTLE" -> "SETTLEMENT_PENDING";
                default -> "REVERSAL_PENDING";
            };
            errorCode = result.errorCode(); errorMessage = result.errorMessage();
        } else {
            status = "FAILED"; errorCode = result.errorCode(); errorMessage = result.errorMessage();
        }
        updatedAt = Instant.now();
        return previous;
    }

    private String sameOrSet(String current, String incoming) {
        if (incoming == null || incoming.isBlank()) return current;
        String value = incoming.trim();
        if (current != null && !current.equals(value)) throw new IllegalStateException("医保外部结算号与既有结果不一致");
        return value;
    }
    private BigDecimal amount(BigDecimal value) { return value == null ? zero() : value.setScale(6); }
    private BigDecimal zero() { return BigDecimal.ZERO.setScale(6); }

    public Long id() { return id; } public long revision() { return revision; } public Long tenantId() { return tenantId; }
    public Long settlementId() { return settlementId; } public Long patientAccountId() { return patientAccountId; }
    public Long coverageId() { return coverageId; } public String claimNo() { return claimNo; }
    public String commandCode() { return commandCode; } public String status() { return status; }
    public String currentOperation() { return currentOperation; } public String regionCode() { return regionCode; }
    public String insuranceTypeCode() { return insuranceTypeCode; } public String payerName() { return payerNameSnapshot; }
    public String organizationCode() { return organizationCode; } public String departmentCode() { return departmentCode; }
    public String practitionerCode() { return practitionerCode; } public String diagnosisPayloadDigest() { return diagnosisPayloadDigest; }
    public Instant serviceStartedAt() { return serviceStartedAt; } public Instant serviceEndedAt() { return serviceEndedAt; }
    public String externalPreSettlementNo() { return externalPreSettlementNo; }
    public String externalSettlementNo() { return externalSettlementNo; } public BigDecimal grossAmount() { return grossAmount; }
    public BigDecimal insuranceFundAmount() { return insuranceFundAmount; } public BigDecimal personalAccountAmount() { return personalAccountAmount; }
    public BigDecimal patientCashAmount() { return patientCashAmount; } public BigDecimal otherFundAmount() { return otherFundAmount; }
    public String currencyCode() { return currencyCode; } public String correlationId() { return correlationId; }
    public String reversalReason() { return reversalReason; } public Instant reversedAt() { return reversedAt; }
    public Instant updatedAt() { return updatedAt; }
    public String errorCode() { return errorCode; } public String errorMessage() { return errorMessage; }
}
