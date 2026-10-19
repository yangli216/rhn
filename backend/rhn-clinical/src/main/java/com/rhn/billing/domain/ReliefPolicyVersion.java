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
import java.time.LocalDate;

/** 政策版本：草稿可修改，发布后作为结算减免的不可变依据。 */
@Entity
@Table(name = "RHN_BIL_RELIEF_POLICY_VER")
public class ReliefPolicyVersion {
    @Id @Column(name = "ID_POLICY_VER") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_RELIEF_POLICY", nullable = false) private Long policyId;
    @Column(name = "SN_VER", nullable = false) private int versionNo;
    @Enumerated(EnumType.STRING) @Column(name = "SD_STATUS", nullable = false) private ReliefVersionStatus status;
    @Enumerated(EnumType.STRING) @Column(name = "SD_TIMING", nullable = false) private ReliefTiming timing;
    @Enumerated(EnumType.STRING) @Column(name = "SD_SPONSOR", nullable = false) private ReliefSponsor sponsor;
    @Column(name = "CD_PAYER") private String payerCode;
    @Column(name = "NA_PAYER") private String payerName;
    @Lob @Column(name = "JSON_APPL_SCOPE", nullable = false) private String applicableScopeJson;
    @Column(name = "DA_EFF_FROM", nullable = false) private LocalDate effectiveFrom;
    @Column(name = "DA_EFF_TO") private LocalDate effectiveTo;
    @Column(name = "SN_PRI", nullable = false) private int priority;
    @Column(name = "CD_MUTEX_GROUP") private String mutexGroup;
    @Column(name = "FG_STACK", nullable = false) private boolean stackable;
    @Enumerated(EnumType.STRING) @Column(name = "SD_QUALIF_MODE", nullable = false) private ReliefQualificationMode qualificationMode;
    @Column(name = "FG_INS_APPL", nullable = false) private boolean insuredApplicable;
    @Column(name = "FG_BASE_PERS_ACCT", nullable = false) private boolean baseIncludesPersonalAccount;
    @Column(name = "AMT_ONCE_MAX", precision = 24, scale = 6) private BigDecimal onceMaxAmount;
    @Enumerated(EnumType.STRING) @Column(name = "SD_QUOTA_PERIOD", nullable = false) private ReliefQuotaPeriod quotaPeriod;
    @Column(name = "AMT_PERIOD_MAX", precision = 24, scale = 6) private BigDecimal periodMaxAmount;
    @Column(name = "QTY_PERIOD_MAX") private Integer periodMaxCount;
    @Column(name = "FG_SHARE_SCENE", nullable = false) private boolean shareAcrossScenes;
    @Column(name = "FG_SHARE_ORG", nullable = false) private boolean shareAcrossOrganizations;
    @Column(name = "AMT_MANUAL_APRV", precision = 24, scale = 6) private BigDecimal manualApprovalAmount;
    @Column(name = "DES_VER_NOTE") private String versionNote;
    @Column(name = "ID_USER_CREATED", nullable = false) private Long createdBy;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_PUBLISD") private Long publishedBy;
    @Column(name = "DT_PUBLISD") private Instant publishedAt;

    protected ReliefPolicyVersion() {}

    public ReliefPolicyVersion(Long tenantId, Long policyId, int versionNo, Terms terms, Long actorId, Instant occurredAt) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.policyId = policyId; this.versionNo = versionNo;
        this.status = ReliefVersionStatus.DRAFT; this.createdBy = actorId; this.createdAt = occurredAt;
        apply(terms);
    }

    public void revise(Terms terms) {
        if (status != ReliefVersionStatus.DRAFT) throw new IllegalStateException("已发布的政策版本不能修改");
        apply(terms);
    }

    public void publish(Long actorId, Instant occurredAt) {
        if (status != ReliefVersionStatus.DRAFT) throw new IllegalStateException("仅草稿版本可以发布");
        this.status = ReliefVersionStatus.PUBLISHED; this.publishedBy = actorId; this.publishedAt = occurredAt;
    }

    public void supersede() {
        if (status != ReliefVersionStatus.PUBLISHED) throw new IllegalStateException("仅已发布版本可以被替代");
        this.status = ReliefVersionStatus.SUPERSEDED;
    }

    public boolean effectiveOn(LocalDate date) {
        return !date.isBefore(effectiveFrom) && (effectiveTo == null || !date.isAfter(effectiveTo));
    }

    private void apply(Terms terms) {
        terms.validate();
        this.timing = terms.timing(); this.sponsor = terms.sponsor();
        this.payerCode = terms.payerCode(); this.payerName = terms.payerName();
        this.applicableScopeJson = terms.applicableScopeJson();
        this.effectiveFrom = terms.effectiveFrom(); this.effectiveTo = terms.effectiveTo();
        this.priority = terms.priority(); this.mutexGroup = terms.mutexGroup(); this.stackable = terms.stackable();
        this.qualificationMode = terms.qualificationMode(); this.insuredApplicable = terms.insuredApplicable();
        this.baseIncludesPersonalAccount = terms.baseIncludesPersonalAccount();
        this.onceMaxAmount = terms.onceMaxAmount(); this.quotaPeriod = terms.quotaPeriod();
        this.periodMaxAmount = terms.periodMaxAmount(); this.periodMaxCount = terms.periodMaxCount();
        this.shareAcrossScenes = terms.shareAcrossScenes();
        this.shareAcrossOrganizations = terms.shareAcrossOrganizations(); this.versionNote = terms.versionNote();
        this.manualApprovalAmount = terms.manualApprovalAmount();
    }

    /**
     * 版本内容；周期额度只有在设置周期时才有意义。
     * manualApprovalAmount 为收费员人工核定的审批阈值：单次核定金额超过该值时需有审批权限的人员核定，为空表示不设阈值。
     */
    public record Terms(ReliefTiming timing, ReliefSponsor sponsor, String payerCode, String payerName,
                        String applicableScopeJson, LocalDate effectiveFrom, LocalDate effectiveTo, int priority,
                        String mutexGroup, boolean stackable, ReliefQualificationMode qualificationMode,
                        boolean insuredApplicable, boolean baseIncludesPersonalAccount, BigDecimal onceMaxAmount,
                        ReliefQuotaPeriod quotaPeriod, BigDecimal periodMaxAmount, Integer periodMaxCount,
                        boolean shareAcrossScenes, boolean shareAcrossOrganizations, String versionNote,
                        BigDecimal manualApprovalAmount) {
        void validate() {
            if (timing == null || sponsor == null || qualificationMode == null || quotaPeriod == null
                    || effectiveFrom == null || applicableScopeJson == null || applicableScopeJson.isBlank()) {
                throw new IllegalArgumentException("政策版本缺少时机、承担主体、资格组合、额度周期、适用范围或生效日期");
            }
            if (effectiveTo != null && effectiveTo.isBefore(effectiveFrom)) {
                throw new IllegalArgumentException("失效日期不能早于生效日期");
            }
            if (!positiveOrNull(onceMaxAmount) || !positiveOrNull(periodMaxAmount) || !positiveOrNull(manualApprovalAmount)
                    || (periodMaxCount != null && periodMaxCount <= 0)) {
                throw new IllegalArgumentException("额度上限必须大于零");
            }
            if (quotaPeriod == ReliefQuotaPeriod.NONE && (periodMaxAmount != null || periodMaxCount != null)) {
                throw new IllegalArgumentException("设置周期额度时必须选择额度周期");
            }
        }

        private static boolean positiveOrNull(BigDecimal value) { return value == null || value.signum() > 0; }
    }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public Long policyId() { return policyId; }
    public int versionNo() { return versionNo; }
    public ReliefVersionStatus status() { return status; }
    public ReliefTiming timing() { return timing; }
    public ReliefSponsor sponsor() { return sponsor; }
    public String payerCode() { return payerCode; }
    public String payerName() { return payerName; }
    public String applicableScopeJson() { return applicableScopeJson; }
    public LocalDate effectiveFrom() { return effectiveFrom; }
    public LocalDate effectiveTo() { return effectiveTo; }
    public int priority() { return priority; }
    public String mutexGroup() { return mutexGroup; }
    public boolean stackable() { return stackable; }
    public ReliefQualificationMode qualificationMode() { return qualificationMode; }
    public boolean insuredApplicable() { return insuredApplicable; }
    public boolean baseIncludesPersonalAccount() { return baseIncludesPersonalAccount; }
    public BigDecimal onceMaxAmount() { return onceMaxAmount; }
    public ReliefQuotaPeriod quotaPeriod() { return quotaPeriod; }
    public BigDecimal periodMaxAmount() { return periodMaxAmount; }
    public Integer periodMaxCount() { return periodMaxCount; }
    public boolean shareAcrossScenes() { return shareAcrossScenes; }
    public boolean shareAcrossOrganizations() { return shareAcrossOrganizations; }
    public String versionNote() { return versionNote; }
    public BigDecimal manualApprovalAmount() { return manualApprovalAmount; }
    public Long createdBy() { return createdBy; }
    public Instant createdAt() { return createdAt; }
    public Long publishedBy() { return publishedBy; }
    public Instant publishedAt() { return publishedAt; }
}
