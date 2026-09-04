package com.rhn.platform.organization.domain;

import com.rhn.platform.organization.api.DepartmentView;
import com.rhn.shared.api.StaleRevisionException;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "departments")
public class Department {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "organization_id", nullable = false) private Long organizationId;
    @Column(name = "parent_id") private Long parentId;
    @Column(name = "merged_to_id") private Long mergedToId;
    @Column(nullable = false) private String code;
    @Column(nullable = false) private String name;
    @Column(name = "short_name") private String shortName;
    @Column private String description;
    @Column(name = "department_type", nullable = false) private String departmentType;
    @Column(name = "department_property") private String departmentProperty;
    @Column(nullable = false) private boolean virtual;
    @Column(name = "sort_order", nullable = false) private int sortOrder;
    @Enumerated(EnumType.STRING) @Column(nullable = false) private OrganizationStatus status;
    @Column(name = "valid_from", nullable = false) private LocalDate validFrom;
    @Column(name = "valid_to") private LocalDate validTo;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "created_by") private Long createdBy;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "updated_by") private Long updatedBy;
    @Version @Column(name = "revision", nullable = false) private long revision;

    protected Department() {
    }

    public Department(Long tenantId, Long organizationId, Long parentId, String code, String name,
                      String shortName, String description, String departmentType, String departmentProperty,
                      boolean virtual, int sortOrder, LocalDate validFrom, LocalDate validTo, Long actorId) {
        Organization.validateDates(validFrom, validTo);
        this.id = com.rhn.shared.id.GlobalIds.next();
        this.tenantId = tenantId;
        this.organizationId = organizationId;
        this.parentId = parentId;
        this.code = code;
        this.name = name;
        this.shortName = shortName;
        this.description = description;
        this.departmentType = departmentType;
        this.departmentProperty = departmentProperty;
        this.virtual = virtual;
        this.sortOrder = sortOrder;
        this.status = OrganizationStatus.ACTIVE;
        this.validFrom = validFrom;
        this.validTo = validTo;
        this.createdAt = Instant.now();
        this.createdBy = actorId;
        this.updatedAt = this.createdAt;
        this.updatedBy = actorId;
    }

    public void update(Long parentId, String name, String shortName, String description,
                       String departmentType, String departmentProperty, boolean virtual, int sortOrder,
                       LocalDate validFrom, LocalDate validTo, long expectedRevision, Long actorId) {
        requireRevision(expectedRevision);
        Organization.validateDates(validFrom, validTo);
        this.parentId = parentId;
        this.name = name;
        this.shortName = shortName;
        this.description = description;
        this.departmentType = departmentType;
        this.departmentProperty = departmentProperty;
        this.virtual = virtual;
        this.sortOrder = sortOrder;
        this.validFrom = validFrom;
        this.validTo = validTo;
        touch(actorId);
    }

    public void changeStatus(OrganizationStatus status, long expectedRevision, Long actorId) {
        requireRevision(expectedRevision);
        this.status = status;
        touch(actorId);
    }

    private void requireRevision(long expectedRevision) {
        if (revision != expectedRevision) {
            throw new StaleRevisionException(revision, "科室已被其他用户修改，请刷新后重试");
        }
    }

    private void touch(Long actorId) {
        this.updatedAt = Instant.now();
        this.updatedBy = actorId;
    }

    public DepartmentView toView() {
        return new DepartmentView(id, revision, organizationId, parentId, mergedToId, code, name, shortName,
                description, departmentType, departmentProperty, structuralType().name(), virtual, sortOrder, status.name(),
                validFrom, validTo, createdAt, updatedAt);
    }

    public OrganizationType structuralType() {
        return switch (departmentProperty == null ? "OTHER" : departmentProperty) {
            case "CLINICAL" -> OrganizationType.CLINICAL_DEPARTMENT;
            case "ADMINISTRATIVE" -> OrganizationType.ADMINISTRATIVE_DEPARTMENT;
            case "MEDICAL_TECHNOLOGY" -> OrganizationType.MEDICAL_TECHNOLOGY_DEPARTMENT;
            case "NURSING" -> OrganizationType.NURSING_UNIT;
            default -> OrganizationType.CLINICAL_DEPARTMENT;
        };
    }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public Long organizationId() { return organizationId; }
    public Long parentId() { return parentId; }
    public Long mergedToId() { return mergedToId; }
    public String code() { return code; }
    public String name() { return name; }
    public String shortName() { return shortName; }
    public String description() { return description; }
    public String departmentType() { return departmentType; }
    public String departmentProperty() { return departmentProperty; }
    public boolean virtual() { return virtual; }
    public int sortOrder() { return sortOrder; }
    public OrganizationStatus status() { return status; }
    public LocalDate validFrom() { return validFrom; }
    public LocalDate validTo() { return validTo; }
    public long revision() { return revision; }
    public Instant createdAt() { return createdAt; }
    public Instant updatedAt() { return updatedAt; }
}
