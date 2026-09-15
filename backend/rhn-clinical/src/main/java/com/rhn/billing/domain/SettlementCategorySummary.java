package com.rhn.billing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "RHN_BIL_STL_CAT_SUM")
public class SettlementCategorySummary {
    @Id @Column(name = "ID_STL_CAT_SUM") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_STL", nullable = false) private Long settlementId;
    @Column(name = "CD_CAT", nullable = false) private String categoryCode;
    @Column(name = "NA_CAT_SNAP") private String categoryNameSnapshot;
    @Column(name = "AMT_CAT", nullable = false, precision = 24, scale = 6) private BigDecimal categoryAmount;
    @Column(name = "DT_AS_OF", nullable = false) private Instant asOf;

    protected SettlementCategorySummary() {}
    public SettlementCategorySummary(Long tenantId, Long settlementId, String categoryCode,
                                     String categoryName, BigDecimal amount, Instant asOf) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.settlementId = settlementId;
        this.categoryCode = categoryCode; this.categoryNameSnapshot = categoryName;
        this.categoryAmount = amount; this.asOf = asOf;
    }
}
