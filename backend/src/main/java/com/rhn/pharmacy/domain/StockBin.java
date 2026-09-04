package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "RHN_SUP_STOCK_BIN")
public class StockBin {
    @Id @Column(name = "ID_STOCK_BIN") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_STOCK_SITE", nullable = false) private Long stockSiteId;
    @Column(name = "ID_STOCK_BIN_PARENT") private Long parentBinId;
    @Column(name = "CD_STOCK_BIN", nullable = false) private String code;
    @Column(name = "NA_STOCK_BIN", nullable = false) private String name;
    @Column(name = "SD_BIN_TYPE", nullable = false) private String binType;
    @Column(name = "SD_STOCK_DEFAULT", nullable = false) private String stockDefault;
    @Column(name = "FG_RECEIVE", nullable = false) private boolean receiveAllowed;
    @Column(name = "FG_PICK", nullable = false) private boolean pickAllowed;
    @Column(name = "FG_COUNT", nullable = false) private boolean countAllowed;
    @Column(name = "SN_SORT", nullable = false) private int sortOrder;
    @Column(name = "FG_ACTIVE", nullable = false) private boolean active;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED", nullable = false) private Long createdBy;

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
