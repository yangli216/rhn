package com.rhn.platform.masterdata.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "organization_catalog_items")
public class OrganizationCatalogItem {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "organization_id", nullable = false) private Long organizationId;
    @Column(name = "catalog_item_id", nullable = false) private Long catalogItemId;
    @Column(name = "default_department_id") private Long defaultDepartmentId;
    @Column(name = "local_code") private String localCode;
    @Column(name = "local_name") private String localName;
    @Column(nullable = false) private boolean orderable;
    @Column(nullable = false) private boolean executable;
    @Column(nullable = false) private boolean chargeable;
    @Column(nullable = false) private boolean purchasable;
    @Column(nullable = false) private boolean stocked;
    @Column(nullable = false) private boolean dispensable;
    @Column(nullable = false) private boolean returnable;
    @Column(nullable = false) private String status;
    @Column(name = "valid_from", nullable = false) private LocalDate validFrom;
    @Column(name = "valid_to") private LocalDate validTo;
    @Column(name = "replaces_adoption_id") private Long replacesAdoptionId;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "created_by") private Long createdBy;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "updated_by") private Long updatedBy;

    protected OrganizationCatalogItem() {}

    public OrganizationCatalogItem(Long tenantId, Long actorId, Long organizationId, Long catalogItemId,
                                   Long defaultDepartmentId, String localCode, String localName,
                                   boolean orderable, boolean executable, boolean chargeable, boolean purchasable,
                                   boolean stocked, boolean dispensable, boolean returnable, String status,
                                   LocalDate validFrom, LocalDate validTo) {
        this(tenantId, actorId, organizationId, catalogItemId, defaultDepartmentId, localCode, localName,
                orderable, executable, chargeable, purchasable, stocked, dispensable, returnable, status,
                validFrom, validTo, null);
    }

    public OrganizationCatalogItem(Long tenantId, Long actorId, Long organizationId, Long catalogItemId,
                                   Long defaultDepartmentId, String localCode, String localName,
                                   boolean orderable, boolean executable, boolean chargeable, boolean purchasable,
                                   boolean stocked, boolean dispensable, boolean returnable, String status,
                                   LocalDate validFrom, LocalDate validTo, Long replacesAdoptionId) {
        ServiceCatalogItem.requirePeriod(validFrom, validTo);
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.organizationId = organizationId;
        this.catalogItemId = catalogItemId; this.defaultDepartmentId = defaultDepartmentId;
        this.localCode = localCode; this.localName = localName; this.orderable = orderable;
        this.executable = executable; this.chargeable = chargeable; this.purchasable = purchasable;
        this.stocked = stocked; this.dispensable = dispensable; this.returnable = returnable;
        this.status = status; this.validFrom = validFrom; this.validTo = validTo;
        this.replacesAdoptionId = replacesAdoptionId;
        this.createdAt = Instant.now(); this.createdBy = actorId; this.updatedAt = this.createdAt; this.updatedBy = actorId;
    }

    public void replace(long expectedRevision, LocalDate successorFrom, Long actorId) {
        requireRevision(expectedRevision);
        if (!successorFrom.isAfter(validFrom)) throw new IllegalArgumentException("替代版本必须晚于原版本生效日期");
        LocalDate end = successorFrom.minusDays(1);
        if (validTo != null && validTo.isBefore(end)) throw new IllegalArgumentException("替代日期与原版本有效期不连续");
        validTo = end; status = "REPLACED"; touch(actorId);
    }

    public void changeStatus(long expectedRevision, String nextStatus, LocalDate endDate, Long actorId) {
        requireRevision(expectedRevision);
        if (!java.util.Set.of("ACTIVE", "SUSPENDED", "RETIRED").contains(nextStatus)) {
            throw new IllegalArgumentException("机构目录状态不正确");
        }
        if ("RETIRED".equals(nextStatus)) {
            if (endDate == null || endDate.isBefore(validFrom)) throw new IllegalArgumentException("停用日期不能早于生效日期");
            validTo = endDate;
        }
        status = nextStatus; touch(actorId);
    }

    public boolean overlaps(LocalDate from, LocalDate to) {
        return (validTo == null || !validTo.isBefore(from)) && (to == null || !to.isBefore(validFrom));
    }

    public boolean effectiveAt(LocalDate date) {
        return !"SUSPENDED".equals(status) && !validFrom.isAfter(date) && (validTo == null || !validTo.isBefore(date));
    }

    private void requireRevision(long expected) {
        if (revision != expected) throw new IllegalStateException("机构目录已被其他用户修改，请刷新后重试");
    }

    private void touch(Long actorId) { updatedAt = Instant.now(); updatedBy = actorId; }

    public Long id() { return id; } public long revision() { return revision; } public Long tenantId() { return tenantId; }
    public Long organizationId() { return organizationId; } public Long catalogItemId() { return catalogItemId; }
    public Long defaultDepartmentId() { return defaultDepartmentId; } public String localCode() { return localCode; }
    public String localName() { return localName; } public boolean orderable() { return orderable; }
    public boolean executable() { return executable; } public boolean chargeable() { return chargeable; }
    public boolean purchasable() { return purchasable; } public boolean stocked() { return stocked; }
    public boolean dispensable() { return dispensable; } public boolean returnable() { return returnable; }
    public String status() { return status; } public LocalDate validFrom() { return validFrom; } public LocalDate validTo() { return validTo; }
    public Long replacesAdoptionId() { return replacesAdoptionId; }
}
