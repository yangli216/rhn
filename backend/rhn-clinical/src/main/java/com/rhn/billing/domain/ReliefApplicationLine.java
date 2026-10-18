package com.rhn.billing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;

/** 减免记录在结算行上的分配，支撑按项目统计和部分退费重算。 */
@Entity
@Table(name = "RHN_BIL_RELIEF_APPLY_LINE")
public class ReliefApplicationLine {
    @Id @Column(name = "ID_RELIEF_APPLY_LINE") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_RELIEF_APPLY", nullable = false) private Long applicationId;
    @Column(name = "ID_STL_LINE", nullable = false) private Long settlementLineId;
    @Column(name = "ID_CHARGE_ITEM", nullable = false) private Long chargeItemId;
    @Column(name = "ID_RELIEF_RULE") private Long ruleId;
    @Column(name = "AMT_BASE", nullable = false, precision = 24, scale = 6) private BigDecimal baseAmount;
    @Column(name = "AMT_RELIEF", nullable = false, precision = 24, scale = 6) private BigDecimal reliefAmount;

    protected ReliefApplicationLine() {}

    public ReliefApplicationLine(Long tenantId, Long applicationId, Long settlementLineId, Long chargeItemId,
                                 Long ruleId, BigDecimal baseAmount, BigDecimal reliefAmount) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.applicationId = applicationId;
        this.settlementLineId = settlementLineId; this.chargeItemId = chargeItemId; this.ruleId = ruleId;
        this.baseAmount = baseAmount; this.reliefAmount = reliefAmount;
    }

    public Long id() { return id; }
    public Long applicationId() { return applicationId; }
    public Long settlementLineId() { return settlementLineId; }
    public Long chargeItemId() { return chargeItemId; }
    public Long ruleId() { return ruleId; }
    public BigDecimal baseAmount() { return baseAmount; }
    public BigDecimal reliefAmount() { return reliefAmount; }
}
