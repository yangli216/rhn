package com.rhn.inpatient.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "service_locations")
public class ServiceLocation {
    @Id private Long id;
    @Version @Column(nullable = false) private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "organization_id", nullable = false) private Long organizationId;
    @Column(name = "department_id") private Long departmentId;
    @Column(name = "parent_id") private Long parentId;
    @Column(nullable = false) private String code;
    @Column(nullable = false) private String name;
    @Column(name = "location_type", nullable = false) private String locationType;
    @Column(name = "sort_order", nullable = false) private int sortOrder;
    @Column(nullable = false) private String status;
    @Column(name = "valid_from", nullable = false) private LocalDate validFrom;
    @Column(name = "valid_to") private LocalDate validTo;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "created_by", nullable = false) private Long createdBy;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "updated_by", nullable = false) private Long updatedBy;

    protected ServiceLocation() {
    }

    public ServiceLocation(Long tenantId, Long organizationId, Long departmentId, Long parentId,
                           String code, String name, String locationType, int sortOrder, Long actorId) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.organizationId = organizationId;
        this.departmentId = departmentId;
        this.parentId = parentId;
        this.code = code;
        this.name = name;
        this.locationType = locationType;
        this.sortOrder = sortOrder;
        this.status = "ACTIVE";
        this.validFrom = LocalDate.now();
        this.createdAt = Instant.now();
        this.createdBy = actorId;
        this.updatedAt = createdAt;
        this.updatedBy = actorId;
    }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long organizationId() { return organizationId; }
    public Long departmentId() { return departmentId; }
    public Long parentId() { return parentId; }
    public String code() { return code; }
    public String name() { return name; }
    public String locationType() { return locationType; }
    public int sortOrder() { return sortOrder; }
    public String status() { return status; }
}
