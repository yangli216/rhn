package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "RHN_SUP_STOCK_RETURN")
public class StockReturn {
    @Id @Column(name = "ID_STOCK_RETURN") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_STOCK_SITE", nullable = false) private Long stockSiteId;
    @Column(name = "ID_PAT", nullable = false) private Long residentId;
    @Column(name = "ID_MED_DISP_ORIGINAL", nullable = false) private Long originalDispenseId;
    @Column(name = "ID_MED_DISP_RETURN", nullable = false) private Long returnDispenseId;
    @Column(name = "CD_RETURN_NO", nullable = false) private String returnNo;
    @Column(name = "SD_RETURN_TYPE", nullable = false) private String returnType;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "CD_REASON", nullable = false) private String reasonCode;
    @Column(name = "DT_REQUESTED", nullable = false) private Instant requestedAt;
    @Column(name = "ID_USER_REQUESTED", nullable = false) private Long requestedBy;
    @Column(name = "DT_CONFIRMED", nullable = false) private Instant confirmedAt;
    @Column(name = "ID_USER_CONFIRMED", nullable = false) private Long confirmedBy;
    @Column(name = "DES_STOCK_RETURN") private String description;

    protected StockReturn() {}

    public StockReturn(Long tenantId, Long stockSiteId, Long residentId, Long originalDispenseId,
                       Long returnDispenseId, String returnNo, String reasonCode, Instant occurredAt,
                       Long actorId, String description) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.stockSiteId = stockSiteId;
        this.residentId = residentId; this.originalDispenseId = originalDispenseId;
        this.returnDispenseId = returnDispenseId; this.returnNo = returnNo; this.returnType = "PATIENT";
        this.status = "CONFIRMED"; this.reasonCode = reasonCode; this.requestedAt = occurredAt;
        this.requestedBy = actorId; this.confirmedAt = Instant.now(); this.confirmedBy = actorId;
        this.description = description;
    }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long stockSiteId() { return stockSiteId; }
    public Long residentId() { return residentId; }
    public Long originalDispenseId() { return originalDispenseId; }
    public Long returnDispenseId() { return returnDispenseId; }
    public String returnNo() { return returnNo; }
    public String returnType() { return returnType; }
    public String status() { return status; }
    public String reasonCode() { return reasonCode; }
    public Instant requestedAt() { return requestedAt; }
    public Instant confirmedAt() { return confirmedAt; }
    public Long confirmedBy() { return confirmedBy; }
    public String description() { return description; }
}
