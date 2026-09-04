package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "RHN_SUP_STOCK_ITEM")
public class StockItem {
    @Id @Column(name = "ID_STOCK_ITEM") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_STOCK_SITE", nullable = false) private Long stockSiteId;
    @Column(name = "ID_CATALOG_ITEM", nullable = false) private Long catalogItemId;
    @Column(name = "ID_ITEM_PKG_BASE", nullable = false) private Long basePackageId;
    @Column(name = "CD_BASE_UNIT", nullable = false) private String baseUnitCode;
    @Column(name = "SD_ISSUE_POLICY", nullable = false) private String issuePolicy;
    @Column(name = "FG_NEGATIVE", nullable = false) private boolean negativeAllowed;
    @Column(name = "FG_LOT_REQUIRED", nullable = false) private boolean lotRequired;
    @Column(name = "FG_TRACE_REQUIRED", nullable = false) private boolean traceRequired;
    @Column(name = "FG_SPLIT", nullable = false) private boolean splitAllowed;
    @Column(name = "FG_COLD_CHAIN", nullable = false) private boolean coldChain;
    @Column(name = "FG_CONTROLLED", nullable = false) private boolean controlled;
    @Column(name = "SD_CONTROL_LEVEL") private String controlLevel;
    @Column(name = "FG_HIGH_ALERT", nullable = false) private boolean highAlert;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED", nullable = false) private Long createdBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED", nullable = false) private Long updatedBy;

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
