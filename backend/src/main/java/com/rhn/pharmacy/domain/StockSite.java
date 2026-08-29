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
@Table(name = "stock_sites")
public class StockSite {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "organization_id", nullable = false) private Long organizationId;
    @Column(name = "department_id") private Long departmentId;
    @Column(nullable = false) private String code;
    @Column(nullable = false) private String name;
    @Column(name = "site_type", nullable = false) private String siteType;
    @Column(name = "service_scope", nullable = false) private String serviceScope;
    @Column(nullable = false) private boolean active;
    @Column(name = "valid_from", nullable = false) private LocalDate validFrom;
    @Column(name = "valid_to") private LocalDate validTo;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "created_by", nullable = false) private Long createdBy;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "updated_by", nullable = false) private Long updatedBy;

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
