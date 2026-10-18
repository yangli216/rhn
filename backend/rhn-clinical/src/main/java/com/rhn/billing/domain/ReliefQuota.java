package com.rhn.billing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.math.BigDecimal;
import java.time.Instant;

/** 居民在一项政策、周期、共享范围和额度对象（整项政策或规则范围）下的已用金额与次数。 */
@Entity
@Table(name = "RHN_BIL_RELIEF_QUOTA")
public class ReliefQuota {
    @Id @Column(name = "ID_RELIEF_QUOTA") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_RELIEF_POLICY", nullable = false) private Long policyId;
    @Column(name = "ID_PAT", nullable = false) private Long residentId;
    @Column(name = "CD_PERIOD", nullable = false) private String periodKey;
    @Column(name = "CD_SHARE", nullable = false) private String shareKey;
    @Column(name = "CD_SCOPE", nullable = false) private String scopeKey;
    @Column(name = "AMT_USED", nullable = false, precision = 24, scale = 6) private BigDecimal usedAmount;
    @Column(name = "QTY_USED", nullable = false) private int usedCount;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;

    protected ReliefQuota() {}

    public ReliefQuota(Long tenantId, ReliefQuotaKey key, Instant occurredAt) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.policyId = key.policyId();
        this.residentId = key.residentId(); this.periodKey = key.periodKey(); this.shareKey = key.shareKey();
        this.scopeKey = key.scopeKey(); this.usedAmount = BigDecimal.ZERO.setScale(6); this.usedCount = 0;
        this.updatedAt = occurredAt;
    }

    /** 占用为正、释放与恢复为负；累计不得低于零。 */
    public void change(BigDecimal amountDelta, int countDelta, Instant occurredAt) {
        BigDecimal amount = usedAmount.add(amountDelta);
        int count = usedCount + countDelta;
        if (amount.signum() < 0 || count < 0) throw new IllegalStateException("减免额度恢复超过已用额度");
        this.usedAmount = amount; this.usedCount = count; this.updatedAt = occurredAt;
    }

    public ReliefQuotaKey key() { return new ReliefQuotaKey(policyId, residentId, periodKey, shareKey, scopeKey); }
    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public BigDecimal usedAmount() { return usedAmount; }
    public int usedCount() { return usedCount; }
    public Instant updatedAt() { return updatedAt; }
}
