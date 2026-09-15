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
@Table(name = "RHN_SUP_STOCK_SITE")
public class StockSite {
    @Id @Column(name = "ID_STOCK_SITE") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_ORG", nullable = false) private Long organizationId;
    @Column(name = "ID_DEPT") private Long departmentId;
    @Column(name = "CD_STOCK_SITE", nullable = false) private String code;
    @Column(name = "NA_STOCK_SITE", nullable = false) private String name;
    @Column(name = "SD_SITE_TYPE", nullable = false) private String siteType;
    @Column(name = "SD_SVC_SCOPE", nullable = false) private String serviceScope;
    @Column(name = "FG_ACTIVE", nullable = false) private boolean active;
    @Column(name = "DA_VALID_FROM", nullable = false) private LocalDate validFrom;
    @Column(name = "DA_VALID_TO") private LocalDate validTo;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED", nullable = false) private Long createdBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED", nullable = false) private Long updatedBy;

    protected StockSite() {}

    public StockSite(Long tenantId, Long organizationId, Long departmentId, String code, String name,
                     String siteType, String serviceScope, LocalDate validFrom, LocalDate validTo, Long actorId) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.organizationId = organizationId;
        this.departmentId = departmentId; this.code = code; this.name = name; this.siteType = siteType;
        this.serviceScope = serviceScope; this.active = true; this.validFrom = validFrom; this.validTo = validTo;
        this.createdAt = Instant.now(); this.createdBy = actorId; this.updatedAt = createdAt; this.updatedBy = actorId;
    }

    public boolean effective(LocalDate date) {
        return active && !validFrom.isAfter(date) && (validTo == null || !validTo.isBefore(date));
    }

    public void synchronizeDepartment(String code, String name, String siteType, String serviceScope,
                                      boolean active, LocalDate validFrom, LocalDate validTo, Long actorId) {
        this.code = code;
        this.name = name;
        this.siteType = siteType;
        this.serviceScope = serviceScope;
        this.active = active;
        this.validFrom = validFrom;
        this.validTo = validTo;
        this.updatedAt = Instant.now();
        this.updatedBy = actorId;
    }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long organizationId() { return organizationId; }
    public Long departmentId() { return departmentId; }
    public String code() { return code; }
    public String name() { return name; }
    public String siteType() { return siteType; }
    public String serviceScope() { return serviceScope; }
    public boolean active() { return active; }
    public LocalDate validFrom() { return validFrom; }
    public LocalDate validTo() { return validTo; }
}
