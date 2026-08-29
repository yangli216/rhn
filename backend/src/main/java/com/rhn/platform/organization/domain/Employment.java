package com.rhn.platform.organization.domain;

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
@Table(name = "employments")
public class Employment {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "practitioner_id", nullable = false) private Long practitionerId;
    @Column(name = "organization_id", nullable = false) private Long organizationId;
    @Column(nullable = false) private String code;
    @Enumerated(EnumType.STRING)
    @Column(name = "employment_type", nullable = false) private EmploymentType employmentType;
    @Column(name = "primary_employment", nullable = false) private boolean primaryEmployment;
    @Column(name = "hire_date", nullable = false) private LocalDate hireDate;
    @Column(name = "leave_date") private LocalDate leaveDate;
    @Enumerated(EnumType.STRING) @Column(nullable = false) private PersonnelStatus status;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "created_by") private Long createdBy;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "updated_by") private Long updatedBy;
    @Version @Column(name = "revision", nullable = false) private long revision;

    protected Employment() {
    }

    public Employment(Long tenantId, Long practitionerId, Long organizationId, String code,
                      EmploymentType employmentType, boolean primaryEmployment, LocalDate hireDate,
                      LocalDate leaveDate, Long actorId) {
        Organization.validateDates(hireDate, leaveDate);
        this.id = com.rhn.shared.id.GlobalIds.next();
        this.tenantId = tenantId;
        this.practitionerId = practitionerId;
        this.organizationId = organizationId;
        this.code = code;
        this.employmentType = employmentType;
        this.primaryEmployment = primaryEmployment;
        this.hireDate = hireDate;
        this.leaveDate = leaveDate;
        this.status = PersonnelStatus.ACTIVE;
        this.createdAt = Instant.now();
        this.createdBy = actorId;
        this.updatedAt = this.createdAt;
        this.updatedBy = actorId;
    }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public Long practitionerId() { return practitionerId; }
    public Long organizationId() { return organizationId; }
    public String code() { return code; }
    public EmploymentType employmentType() { return employmentType; }
    public boolean primaryEmployment() { return primaryEmployment; }
    public LocalDate hireDate() { return hireDate; }
    public LocalDate leaveDate() { return leaveDate; }
    public PersonnelStatus status() { return status; }
    public long revision() { return revision; }
}
