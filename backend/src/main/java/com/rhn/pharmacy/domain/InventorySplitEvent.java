package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "inventory_split_events")
public class InventorySplitEvent {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "open_package_id", nullable = false) private Long openPackageId;
    @Column(name = "event_type", nullable = false) private String eventType;
    @Column(name = "source_type", nullable = false) private String sourceType;
    @Column(name = "source_id") private Long sourceId;
    @Column(name = "source_no", nullable = false) private String sourceNo;
    @Column(name = "quantity_delta", nullable = false, precision = 28, scale = 8) private BigDecimal quantityDelta;
    @Column(name = "balance_after", nullable = false, precision = 28, scale = 8) private BigDecimal balanceAfter;
    @Column(name = "occurred_at", nullable = false) private Instant occurredAt;
    @Column(name = "occurred_by", nullable = false) private Long occurredBy;
    private String description;

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
