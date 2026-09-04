package com.rhn.platform.organization.domain;

import com.rhn.platform.organization.api.OrganizationView;
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
@Table(name = "organizations")
public class Organization {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "parent_id") private Long parentId;
    @Column(name = "merged_to_id") private Long mergedToId;
    @Column(nullable = false) private String code;
    @Column(nullable = false) private String name;
    @Column(name = "short_name") private String shortName;
    @Column private String description;
    @Enumerated(EnumType.STRING)
    @Column(name = "organization_kind", nullable = false) private OrganizationKind organizationKind;
    @Enumerated(EnumType.STRING)
    @Column(name = "organization_type", nullable = false) private OrganizationType organizationType;
    @Column(name = "organization_property") private String organizationProperty;
    @Column(nullable = false) private boolean virtual;
    @Column(name = "sort_order", nullable = false) private int sortOrder;
    @Column(name = "timezone_code") private String timezoneCode;
    @Column(name = "department_type_code") private String departmentTypeCode;
    @Enumerated(EnumType.STRING) @Column(nullable = false) private OrganizationStatus status;
    @Column(name = "valid_from", nullable = false) private LocalDate validFrom;
    @Column(name = "valid_to") private LocalDate validTo;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "created_by") private Long createdBy;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "updated_by") private Long updatedBy;
    @Version @Column(name = "revision", nullable = false) private long revision;

    protected Organization() {
    }

    public Organization(Long tenantId, Long parentId, String code, String name, String shortName,
                        String description,
                        OrganizationKind organizationKind, OrganizationType organizationType,
                        String organizationProperty, boolean virtual, int sortOrder,
                        String timezoneCode, String departmentTypeCode,
                        LocalDate validFrom, LocalDate validTo, Long actorId) {
        validateDates(validFrom, validTo);
        this.id = com.rhn.shared.id.GlobalIds.next();
        this.tenantId = tenantId;
        this.parentId = parentId;
        this.code = code;
        this.name = name;
        this.shortName = shortName;
        this.description = description;
        this.organizationKind = organizationKind;
        this.organizationType = organizationType;
        this.organizationProperty = organizationProperty;
        this.virtual = virtual;
        this.sortOrder = sortOrder;
        this.timezoneCode = timezoneCode;
        this.departmentTypeCode = departmentTypeCode;
        this.status = OrganizationStatus.ACTIVE;
        this.validFrom = validFrom;
        this.validTo = validTo;
        this.createdAt = Instant.now();
        this.createdBy = actorId;
        this.updatedAt = this.createdAt;
        this.updatedBy = actorId;
    }

    public void update(Long parentId, String name, String shortName, String description,
                       OrganizationType type, String organizationProperty, boolean virtual,
                       int sortOrder, String timezoneCode, String departmentTypeCode,
                       LocalDate validFrom, LocalDate validTo, long expectedRevision, Long actorId) {
        requireRevision(expectedRevision);
        validateDates(validFrom, validTo);
        this.parentId = parentId;
        this.name = name;
        this.shortName = shortName;
        this.description = description;
        this.organizationType = type;
        this.organizationProperty = organizationProperty;
        this.virtual = virtual;
        this.sortOrder = sortOrder;
        this.timezoneCode = timezoneCode;
        this.departmentTypeCode = departmentTypeCode;
        this.validFrom = validFrom;
        this.validTo = validTo;
        touch(actorId);
    }

    public void changeStatus(OrganizationStatus status, long expectedRevision, Long actorId) {
        requireRevision(expectedRevision);
        this.status = status;
        touch(actorId);
    }

    private void touch(Long actorId) {
        this.updatedAt = Instant.now();
        this.updatedBy = actorId;
    }

    private void requireRevision(long expectedRevision) {
        if (revision != expectedRevision) {
            throw new StaleRevisionException(revision, "组织已被其他用户修改，请刷新后重试");
        }
    }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public Long parentId() { return parentId; }
    public String code() { return code; }
    public String name() { return name; }
    public String shortName() { return shortName; }
    public String description() { return description; }
    public OrganizationKind organizationKind() { return organizationKind; }
    public OrganizationType organizationType() { return organizationType; }
    public String organizationProperty() { return organizationProperty; }
    public boolean virtual() { return virtual; }
    public int sortOrder() { return sortOrder; }
    public String timezoneCode() { return timezoneCode; }
    public String departmentTypeCode() { return departmentTypeCode; }
    public OrganizationStatus status() { return status; }
    public LocalDate validFrom() { return validFrom; }
    public LocalDate validTo() { return validTo; }
    public long revision() { return revision; }

    public OrganizationView toView() {
        return new OrganizationView(id, revision, parentId, mergedToId, code, name, shortName, description,
                organizationKind.name(), organizationType.name(), status.name(), organizationProperty, virtual, sortOrder,
                timezoneCode, departmentTypeCode, null, validFrom, validTo, createdAt, updatedAt);
    }

    public static void validateDates(LocalDate validFrom, LocalDate validTo) {
        if (validFrom == null || validTo != null && validTo.isBefore(validFrom)) {
            throw new IllegalArgumentException("invalid validity period");
        }
    }
}
