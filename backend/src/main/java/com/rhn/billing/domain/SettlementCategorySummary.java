package com.rhn.billing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "settlement_category_summaries")
public class SettlementCategorySummary {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "settlement_id", nullable = false) private Long settlementId;
    @Column(name = "category_code", nullable = false) private String categoryCode;
    @Column(name = "category_name_snapshot") private String categoryNameSnapshot;
    @Column(name = "category_amount", nullable = false, precision = 24, scale = 6) private BigDecimal categoryAmount;
    @Column(name = "as_of", nullable = false) private Instant asOf;

    protected SettlementCategorySummary() {}
    public SettlementCategorySummary(Long tenantId, Long settlementId, String categoryCode,
                                     String categoryName, BigDecimal amount, Instant asOf) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.settlementId = settlementId;
        this.categoryCode = categoryCode; this.categoryNameSnapshot = categoryName;
        this.categoryAmount = amount; this.asOf = asOf;
    }
}
