package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "stock_bins")
public class StockBin {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "stock_site_id", nullable = false) private Long stockSiteId;
    @Column(name = "parent_bin_id") private Long parentBinId;
    @Column(nullable = false) private String code;
    @Column(nullable = false) private String name;
    @Column(name = "bin_type", nullable = false) private String binType;
    @Column(name = "stock_default", nullable = false) private String stockDefault;
    @Column(name = "receive_allowed", nullable = false) private boolean receiveAllowed;
    @Column(name = "pick_allowed", nullable = false) private boolean pickAllowed;
    @Column(name = "count_allowed", nullable = false) private boolean countAllowed;
    @Column(name = "sort_order", nullable = false) private int sortOrder;
    @Column(nullable = false) private boolean active;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "created_by", nullable = false) private Long createdBy;

    protected StockBin() {}

    public StockBin(Long tenantId, Long stockSiteId, Long parentBinId, String code, String name,
                    String binType, String stockDefault, boolean receiveAllowed, boolean pickAllowed,
                    boolean countAllowed, int sortOrder, Long actorId) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.stockSiteId = stockSiteId;
        this.parentBinId = parentBinId; this.code = code; this.name = name; this.binType = binType;
        this.stockDefault = stockDefault; this.receiveAllowed = receiveAllowed; this.pickAllowed = pickAllowed;
        this.countAllowed = countAllowed; this.sortOrder = sortOrder; this.active = true;
        this.createdAt = Instant.now(); this.createdBy = actorId;
    }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long stockSiteId() { return stockSiteId; }
    public Long parentBinId() { return parentBinId; }
    public String code() { return code; }
    public String name() { return name; }
    public String binType() { return binType; }
    public String stockDefault() { return stockDefault; }
    public boolean receiveAllowed() { return receiveAllowed; }
    public boolean pickAllowed() { return pickAllowed; }
    public boolean countAllowed() { return countAllowed; }
    public int sortOrder() { return sortOrder; }
    public boolean active() { return active; }
}
