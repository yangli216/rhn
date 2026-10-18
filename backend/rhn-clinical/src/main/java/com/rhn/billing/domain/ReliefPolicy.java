package com.rhn.billing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

/** 惠民减免政策头；计算内容只存在于不可变的已发布版本。 */
@Entity
@Table(name = "RHN_BIL_RELIEF_POLICY")
public class ReliefPolicy {
    @Id @Column(name = "ID_RELIEF_POLICY") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "CD_POLICY", nullable = false) private String code;
    @Column(name = "NA_POLICY", nullable = false) private String name;
    @Column(name = "DES_POLICY") private String description;
    @Enumerated(EnumType.STRING) @Column(name = "SD_STATUS", nullable = false) private ReliefPolicyStatus status;
    @Column(name = "ID_POLICY_VER_CUR") private Long currentVersionId;
    @Column(name = "ID_USER_CREATED", nullable = false) private Long createdBy;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_UPDATED", nullable = false) private Long updatedBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;

    protected ReliefPolicy() {}

    public ReliefPolicy(Long tenantId, String code, String name, String description, Long actorId, Instant occurredAt) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.code = code; this.name = name;
        this.description = description; this.status = ReliefPolicyStatus.DRAFT;
        this.createdBy = actorId; this.createdAt = occurredAt; this.updatedBy = actorId; this.updatedAt = occurredAt;
    }

    public void rename(String name, String description, Long actorId, Instant occurredAt) {
        this.name = name; this.description = description; touch(actorId, occurredAt);
    }

    /** 发布版本后政策进入生效；暂停或停用的政策重新发布时同样恢复生效。 */
    public void publish(ReliefPolicyVersion version, Long actorId, Instant occurredAt) {
        if (status == ReliefPolicyStatus.RETIRED) throw new IllegalStateException("已停用的政策不能发布新版本");
        if (!id.equals(version.policyId())) throw new IllegalArgumentException("政策版本不属于当前政策");
        this.currentVersionId = version.id(); this.status = ReliefPolicyStatus.ACTIVE; touch(actorId, occurredAt);
    }

    public void suspend(Long actorId, Instant occurredAt) {
        if (status != ReliefPolicyStatus.ACTIVE) throw new IllegalStateException("仅生效中的政策可以暂停");
        this.status = ReliefPolicyStatus.SUSPENDED; touch(actorId, occurredAt);
    }

    public void resume(Long actorId, Instant occurredAt) {
        if (status != ReliefPolicyStatus.SUSPENDED) throw new IllegalStateException("仅暂停的政策可以恢复");
        this.status = ReliefPolicyStatus.ACTIVE; touch(actorId, occurredAt);
    }

    public void retire(Long actorId, Instant occurredAt) {
        this.status = ReliefPolicyStatus.RETIRED; touch(actorId, occurredAt);
    }

    private void touch(Long actorId, Instant occurredAt) { this.updatedBy = actorId; this.updatedAt = occurredAt; }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public String code() { return code; }
    public String name() { return name; }
    public String description() { return description; }
    public ReliefPolicyStatus status() { return status; }
    public Long currentVersionId() { return currentVersionId; }
    public Long createdBy() { return createdBy; }
    public Instant createdAt() { return createdAt; }
    public Long updatedBy() { return updatedBy; }
    public Instant updatedAt() { return updatedAt; }
}
