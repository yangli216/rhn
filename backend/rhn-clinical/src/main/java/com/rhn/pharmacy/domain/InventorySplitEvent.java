package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "RHN_SUP_INV_SPLIT_EVT")
public class InventorySplitEvent {
    @Id @Column(name = "ID_INV_SPLIT_EVT") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_INV_OPEN_PKG", nullable = false) private Long openPackageId;
    @Column(name = "SD_EVT_TYPE", nullable = false) private String eventType;
    @Column(name = "SD_SRC_TYPE", nullable = false) private String sourceType;
    @Column(name = "ID_SRC") private Long sourceId;
    @Column(name = "CD_SRC_NO", nullable = false) private String sourceNo;
    @Column(name = "QTY_DELTA", nullable = false, precision = 28, scale = 8) private BigDecimal quantityDelta;
    @Column(name = "BALANCE_AFTER", nullable = false, precision = 28, scale = 8) private BigDecimal balanceAfter;
    @Column(name = "DT_OCCRD", nullable = false) private Instant occurredAt;
    @Column(name = "ID_USER_OCCRD", nullable = false) private Long occurredBy;
    @Column(name = "DES_INV_SPLIT_EVT") private String description;

    protected InventorySplitEvent() {}

    public InventorySplitEvent(Long tenantId, Long openPackageId, String eventType, String sourceType,
                               Long sourceId, String sourceNo, BigDecimal quantityDelta,
                               BigDecimal balanceAfter, Instant occurredAt, Long occurredBy, String description) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.openPackageId = openPackageId;
        this.eventType = eventType; this.sourceType = sourceType; this.sourceId = sourceId; this.sourceNo = sourceNo;
        this.quantityDelta = quantityDelta; this.balanceAfter = balanceAfter; this.occurredAt = occurredAt;
        this.occurredBy = occurredBy; this.description = description;
    }

    public Long id() { return id; } public Long openPackageId() { return openPackageId; }
    public String eventType() { return eventType; } public String sourceType() { return sourceType; }
    public Long sourceId() { return sourceId; } public String sourceNo() { return sourceNo; }
    public BigDecimal quantityDelta() { return quantityDelta; } public BigDecimal balanceAfter() { return balanceAfter; }
    public Instant occurredAt() { return occurredAt; } public Long occurredBy() { return occurredBy; }
    public String description() { return description; }
}
