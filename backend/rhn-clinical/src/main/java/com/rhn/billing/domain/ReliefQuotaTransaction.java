package com.rhn.billing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;

/** 额度流水：每次占用、确认、释放或恢复一行，命令码保证重复请求不重复累计。 */
@Entity
@Table(name = "RHN_BIL_RELIEF_QUOTA_TXN")
public class ReliefQuotaTransaction {
    @Id @Column(name = "ID_QUOTA_TXN") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_RELIEF_QUOTA", nullable = false) private Long quotaId;
    @Column(name = "ID_RELIEF_APPLY") private Long applicationId;
    @Enumerated(EnumType.STRING) @Column(name = "SD_TXN_TYPE", nullable = false) private ReliefQuotaTransactionType type;
    @Column(name = "AMT_DELTA", nullable = false, precision = 24, scale = 6) private BigDecimal amountDelta;
    @Column(name = "QTY_DELTA", nullable = false) private int countDelta;
    @Column(name = "CD_COMMAND", nullable = false) private String commandCode;
    @Column(name = "ID_USER", nullable = false) private Long actorId;
    @Column(name = "DT_OCCRD", nullable = false) private Instant occurredAt;

    protected ReliefQuotaTransaction() {}

    public ReliefQuotaTransaction(Long tenantId, Long quotaId, Long applicationId, ReliefQuotaTransactionType type,
                                  BigDecimal amountDelta, int countDelta, String commandCode, Long actorId,
                                  Instant occurredAt) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.quotaId = quotaId; this.applicationId = applicationId;
        this.type = type; this.amountDelta = amountDelta; this.countDelta = countDelta; this.commandCode = commandCode;
        this.actorId = actorId; this.occurredAt = occurredAt;
    }

    public Long id() { return id; }
    public Long quotaId() { return quotaId; }
    public Long applicationId() { return applicationId; }
    public ReliefQuotaTransactionType type() { return type; }
    public BigDecimal amountDelta() { return amountDelta; }
    public int countDelta() { return countDelta; }
    public String commandCode() { return commandCode; }
    public Instant occurredAt() { return occurredAt; }
}
