package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "inventory_periods")
public class InventoryPeriod {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "stock_site_id", nullable = false) private Long stockSiteId;
    @Column(name = "period_code", nullable = false) private String periodCode;
    @Column(name = "period_from", nullable = false) private LocalDate periodFrom;
    @Column(name = "period_to", nullable = false) private LocalDate periodTo;
    @Column(nullable = false) private String status;
    @Column(name = "closed_at") private Instant closedAt;
    @Column(name = "closed_by") private Long closedBy;
    @Column private String description;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "created_by", nullable = false) private Long createdBy;

    protected InventoryPeriod() {}

    public InventoryPeriod(Long tenantId, Long stockSiteId, String periodCode,
                           LocalDate periodFrom, LocalDate periodTo, Long actorId) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.stockSiteId = stockSiteId;
        this.periodCode = periodCode; this.periodFrom = periodFrom; this.periodTo = periodTo;
        this.status = "OPEN"; this.createdAt = Instant.now(); this.createdBy = actorId;
    }

    public boolean accepts(LocalDate date) {
        return "OPEN".equals(status) && !date.isBefore(periodFrom) && !date.isAfter(periodTo);
    }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long stockSiteId() { return stockSiteId; }
    public String periodCode() { return periodCode; }
    public LocalDate periodFrom() { return periodFrom; }
    public LocalDate periodTo() { return periodTo; }
    public String status() { return status; }
}
