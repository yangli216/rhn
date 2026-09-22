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
@Table(name = "RHN_SUP_INV_PERIOD")
public class InventoryPeriod {
    @Id @Column(name = "ID_INV_PERIOD") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_STOCK_SITE", nullable = false) private Long stockSiteId;
    @Column(name = "ID_INV_PERIOD_PREV") private Long previousPeriodId;
    @Column(name = "ID_INV_PERIOD_CLOSE_RUN_CLOSE") private Long closingRunId;
    @Column(name = "CD_PERIOD", nullable = false) private String periodCode;
    @Column(name = "DA_PERIOD_FROM", nullable = false) private LocalDate periodFrom;
    @Column(name = "DA_PERIOD_TO", nullable = false) private LocalDate periodTo;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DT_CLOSED") private Instant closedAt;
    @Column(name = "ID_USER_CLOSED") private Long closedBy;
    @Column(name = "DES_INV_PERIOD") private String description;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED", nullable = false) private Long createdBy;

    protected InventoryPeriod() {}

    public InventoryPeriod(Long tenantId, Long stockSiteId, String periodCode,
                           LocalDate periodFrom, LocalDate periodTo, Long actorId) {
        this(tenantId, stockSiteId, null, periodCode, periodFrom, periodTo, actorId);
    }

    public InventoryPeriod(Long tenantId, Long stockSiteId, Long previousPeriodId, String periodCode,
                           LocalDate periodFrom, LocalDate periodTo, Long actorId) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.stockSiteId = stockSiteId;
        this.previousPeriodId = previousPeriodId;
        this.periodCode = periodCode; this.periodFrom = periodFrom; this.periodTo = periodTo;
        this.status = "OPEN"; this.createdAt = Instant.now(); this.createdBy = actorId;
    }

    public boolean accepts(LocalDate date) {
        return "OPEN".equals(status) && !date.isBefore(periodFrom) && !date.isAfter(periodTo);
    }

    public void beginClosing() {
        if (!"OPEN".equals(status)) throw new IllegalStateException("Inventory period is not open");
        status = "CLOSING";
    }

    public void close(Long closeRunId, Long actorId) {
        if (!"CLOSING".equals(status)) throw new IllegalStateException("Inventory period is not closing");
        this.status = "CLOSED"; this.closingRunId = closeRunId;
        this.closedAt = Instant.now(); this.closedBy = actorId;
    }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long stockSiteId() { return stockSiteId; }
    public Long previousPeriodId() { return previousPeriodId; }
    public Long closingRunId() { return closingRunId; }
    public String periodCode() { return periodCode; }
    public LocalDate periodFrom() { return periodFrom; }
    public LocalDate periodTo() { return periodTo; }
    public String status() { return status; }
    public Instant closedAt() { return closedAt; }
    public Long closedBy() { return closedBy; }
    public String description() { return description; }
    public Instant createdAt() { return createdAt; }
    public Long createdBy() { return createdBy; }
}
