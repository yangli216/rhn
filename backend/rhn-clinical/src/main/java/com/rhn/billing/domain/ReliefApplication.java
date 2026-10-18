package com.rhn.billing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;

/** 一项政策对一张结算单的一次减免；冲销以金额为负的新记录表示，原记录标记为已冲销。 */
@Entity
@Table(name = "RHN_BIL_RELIEF_APPLY")
public class ReliefApplication {
    @Id @Column(name = "ID_RELIEF_APPLY") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_ORG", nullable = false) private Long organizationId;
    @Column(name = "ID_STL", nullable = false) private Long settlementId;
    @Column(name = "ID_PAT", nullable = false) private Long residentId;
    @Column(name = "ID_RELIEF_POLICY", nullable = false) private Long policyId;
    @Column(name = "ID_POLICY_VER", nullable = false) private Long policyVersionId;
    @Enumerated(EnumType.STRING) @Column(name = "SD_TIMING", nullable = false) private ReliefTiming timing;
    @Enumerated(EnumType.STRING) @Column(name = "SD_SPONSOR", nullable = false) private ReliefSponsor sponsor;
    @Column(name = "SD_STL_SCENE", nullable = false) private String settlementScene;
    @Column(name = "AMT_BASE", nullable = false, precision = 24, scale = 6) private BigDecimal baseAmount;
    @Column(name = "AMT_RELIEF", nullable = false, precision = 24, scale = 6) private BigDecimal reliefAmount;
    @Enumerated(EnumType.STRING) @Column(name = "SD_STATUS", nullable = false) private ReliefApplicationStatus status;
    @Column(name = "ID_RELIEF_APPLY_RVRS") private Long reversesApplicationId;
    @Column(name = "ID_STL_TENDER") private Long tenderId;
    @Lob @Column(name = "JSON_QUALIF_EVID") private String qualificationEvidenceJson;
    @Column(name = "DES_MANUAL_REASON") private String manualReason;
    @Column(name = "DES_MANUAL_EVID") private String manualEvidence;
    @Column(name = "ID_USER_APRVD") private Long approvedBy;
    @Column(name = "CD_COMMAND", nullable = false) private String commandCode;
    @Column(name = "ID_USER_CREATED", nullable = false) private Long createdBy;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;

    protected ReliefApplication() {}

    public ReliefApplication(Long tenantId, Long organizationId, Long settlementId, Long residentId,
                             ReliefPolicyVersion version, String settlementScene, BigDecimal baseAmount,
                             BigDecimal reliefAmount, String qualificationEvidenceJson, ManualApproval manual,
                             String commandCode, Long actorId, Instant occurredAt) {
        if (reliefAmount.signum() <= 0 || baseAmount.compareTo(reliefAmount) < 0) {
            throw new IllegalArgumentException("减免金额必须大于零且不超过计算基数");
        }
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.organizationId = organizationId;
        this.settlementId = settlementId; this.residentId = residentId; this.policyId = version.policyId();
        this.policyVersionId = version.id(); this.timing = version.timing(); this.sponsor = version.sponsor();
        this.settlementScene = settlementScene; this.baseAmount = baseAmount; this.reliefAmount = reliefAmount;
        this.status = ReliefApplicationStatus.APPLIED; this.qualificationEvidenceJson = qualificationEvidenceJson;
        if (manual != null) {
            this.manualReason = manual.reason(); this.manualEvidence = manual.evidence(); this.approvedBy = manual.approvedBy();
        }
        this.commandCode = commandCode; this.createdBy = actorId; this.createdAt = occurredAt;
    }

    private ReliefApplication(ReliefApplication original, Long settlementId, BigDecimal amount, String commandCode,
                              Long actorId, Instant occurredAt) {
        this.id = GlobalIds.next(); this.tenantId = original.tenantId; this.organizationId = original.organizationId;
        this.settlementId = settlementId; this.residentId = original.residentId; this.policyId = original.policyId;
        this.policyVersionId = original.policyVersionId; this.timing = original.timing; this.sponsor = original.sponsor;
        this.settlementScene = original.settlementScene; this.baseAmount = BigDecimal.ZERO.setScale(6);
        this.reliefAmount = amount.negate(); this.status = ReliefApplicationStatus.APPLIED;
        this.reversesApplicationId = original.id; this.commandCode = commandCode;
        this.createdBy = actorId; this.createdAt = occurredAt;
    }

    /**
     * 冲销全部或部分减免；部分退费时金额为当前有效减免与保留费用重算结果之差。
     * alreadyReversed 为此前冲销的累计金额，累计冲销达到原减免金额时原记录标记为已冲销。
     */
    public ReliefApplication reverse(Long reversalSettlementId, BigDecimal amount, BigDecimal alreadyReversed,
                                     String commandCode, Long actorId, Instant occurredAt) {
        if (reversesApplicationId != null) throw new IllegalStateException("冲销记录不能再次冲销");
        if (status == ReliefApplicationStatus.REVERSED) throw new IllegalStateException("减免已全部冲销");
        BigDecimal remaining = reliefAmount.subtract(alreadyReversed);
        if (amount.signum() <= 0 || amount.compareTo(remaining) > 0) {
            throw new IllegalArgumentException("冲销金额必须大于零且不超过原减免金额");
        }
        if (amount.compareTo(remaining) == 0) status = ReliefApplicationStatus.REVERSED;
        return new ReliefApplication(this, reversalSettlementId, amount, commandCode, actorId, occurredAt);
    }

    public void bindTender(Long tenderId) {
        if (timing != ReliefTiming.POST_INSURANCE) throw new IllegalStateException("医保前减免不记入结算支付");
        this.tenderId = tenderId;
    }

    public record ManualApproval(String reason, String evidence, Long approvedBy) {
        public ManualApproval {
            if (reason == null || reason.isBlank() || approvedBy == null) {
                throw new IllegalArgumentException("人工核准必须填写原因并记录核准人");
            }
        }
    }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public Long organizationId() { return organizationId; }
    public Long settlementId() { return settlementId; }
    public Long residentId() { return residentId; }
    public Long policyId() { return policyId; }
    public Long policyVersionId() { return policyVersionId; }
    public ReliefTiming timing() { return timing; }
    public ReliefSponsor sponsor() { return sponsor; }
    public String settlementScene() { return settlementScene; }
    public BigDecimal baseAmount() { return baseAmount; }
    public BigDecimal reliefAmount() { return reliefAmount; }
    public ReliefApplicationStatus status() { return status; }
    public Long reversesApplicationId() { return reversesApplicationId; }
    public Long tenderId() { return tenderId; }
    public String qualificationEvidenceJson() { return qualificationEvidenceJson; }
    public String manualReason() { return manualReason; }
    public String manualEvidence() { return manualEvidence; }
    public Long approvedBy() { return approvedBy; }
    public String commandCode() { return commandCode; }
    public Long createdBy() { return createdBy; }
    public Instant createdAt() { return createdAt; }
}
