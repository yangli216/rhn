package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "stock_returns")
public class StockReturn {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "stock_site_id", nullable = false) private Long stockSiteId;
    @Column(name = "resident_id", nullable = false) private Long residentId;
    @Column(name = "original_dispense_id", nullable = false) private Long originalDispenseId;
    @Column(name = "return_dispense_id", nullable = false) private Long returnDispenseId;
    @Column(name = "return_no", nullable = false) private String returnNo;
    @Column(name = "return_type", nullable = false) private String returnType;
    @Column(nullable = false) private String status;
    @Column(name = "reason_code", nullable = false) private String reasonCode;
    @Column(name = "requested_at", nullable = false) private Instant requestedAt;
    @Column(name = "requested_by", nullable = false) private Long requestedBy;
    @Column(name = "confirmed_at", nullable = false) private Instant confirmedAt;
    @Column(name = "confirmed_by", nullable = false) private Long confirmedBy;
    @Column private String description;

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
