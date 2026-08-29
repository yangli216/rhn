package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "stock_items")
public class StockItem {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "stock_site_id", nullable = false) private Long stockSiteId;
    @Column(name = "catalog_item_id", nullable = false) private Long catalogItemId;
    @Column(name = "base_package_id", nullable = false) private Long basePackageId;
    @Column(name = "base_unit_code", nullable = false) private String baseUnitCode;
    @Column(name = "issue_policy", nullable = false) private String issuePolicy;
    @Column(name = "negative_allowed", nullable = false) private boolean negativeAllowed;
    @Column(name = "lot_required", nullable = false) private boolean lotRequired;
    @Column(name = "trace_required", nullable = false) private boolean traceRequired;
    @Column(name = "split_allowed", nullable = false) private boolean splitAllowed;
    @Column(name = "cold_chain", nullable = false) private boolean coldChain;
    @Column(name = "controlled", nullable = false) private boolean controlled;
    @Column(name = "control_level") private String controlLevel;
    @Column(name = "high_alert", nullable = false) private boolean highAlert;
    @Column(nullable = false) private String status;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "created_by", nullable = false) private Long createdBy;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "updated_by", nullable = false) private Long updatedBy;

    protected StockItem() {}

    public StockItem(Long tenantId, Long stockSiteId, Long catalogItemId, Long basePackageId,
                     String baseUnitCode, String issuePolicy, boolean negativeAllowed, boolean lotRequired,
                     boolean traceRequired, boolean splitAllowed, boolean coldChain, boolean controlled,
                     String controlLevel, boolean highAlert, Long actorId) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.stockSiteId = stockSiteId;
        this.catalogItemId = catalogItemId; this.basePackageId = basePackageId; this.baseUnitCode = baseUnitCode;
        this.issuePolicy = issuePolicy; this.negativeAllowed = negativeAllowed; this.lotRequired = lotRequired;
        this.traceRequired = traceRequired; this.splitAllowed = splitAllowed; this.coldChain = coldChain;
        this.controlled = controlled; this.controlLevel = controlLevel; this.highAlert = highAlert;
        this.status = "ACTIVE"; this.createdAt = Instant.now(); this.createdBy = actorId;
        this.updatedAt = createdAt; this.updatedBy = actorId;
    }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long stockSiteId() { return stockSiteId; }
    public Long catalogItemId() { return catalogItemId; }
    public Long basePackageId() { return basePackageId; }
    public String baseUnitCode() { return baseUnitCode; }
    public String issuePolicy() { return issuePolicy; }
    public boolean negativeAllowed() { return negativeAllowed; }
    public boolean lotRequired() { return lotRequired; }
    public boolean traceRequired() { return traceRequired; }
    public boolean splitAllowed() { return splitAllowed; }
    public boolean coldChain() { return coldChain; }
    public boolean controlled() { return controlled; }
    public String controlLevel() { return controlLevel; }
    public boolean highAlert() { return highAlert; }
    public String status() { return status; }
}
