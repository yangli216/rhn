package com.rhn.platform.organization.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "staff_assignments")
public class PersonnelAssignment {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "employment_id", nullable = false) private Long employmentId;
    @Column(name = "organization_id", nullable = false) private Long organizationId;
    @Column(name = "department_id", nullable = false) private Long departmentId;
    @Column(name = "position_id", nullable = false) private Long positionId;
    @Column(nullable = false) private String code;
    @Enumerated(EnumType.STRING)
    @Column(name = "assignment_type", nullable = false) private AssignmentType assignmentType;
    @Column(name = "specialty_code") private String specialtyCode;
    @Column(name = "primary_assignment", nullable = false) private boolean primaryAssignment;
    @Column(name = "workload_percent") private BigDecimal workloadPercent;
    @Enumerated(EnumType.STRING) @Column(nullable = false) private PersonnelStatus status;
    @Column(name = "valid_from", nullable = false) private LocalDate validFrom;
    @Column(name = "valid_to") private LocalDate validTo;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "created_by") private Long createdBy;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "updated_by") private Long updatedBy;
    @Version @Column(name = "revision", nullable = false) private long revision;

    protected PersonnelAssignment() {
    }

    public PersonnelAssignment(Long tenantId, Long employmentId, Long organizationId, Long departmentId,
                               Long positionId,
                               String code, AssignmentType assignmentType, String specialtyCode,
                               boolean primaryAssignment, BigDecimal workloadPercent,
                               LocalDate validFrom, LocalDate validTo, Long actorId) {
        Organization.validateDates(validFrom, validTo);
        this.id = com.rhn.shared.id.GlobalIds.next();
        this.tenantId = tenantId;
        this.employmentId = employmentId;
        this.organizationId = organizationId;
        this.departmentId = departmentId;
        this.positionId = positionId;
        this.code = code;
        this.assignmentType = assignmentType;
        this.specialtyCode = specialtyCode;
        this.primaryAssignment = primaryAssignment;
        this.workloadPercent = workloadPercent;
        this.status = PersonnelStatus.ACTIVE;
        this.validFrom = validFrom;
        this.validTo = validTo;
        this.createdAt = Instant.now();
        this.createdBy = actorId;
        this.updatedAt = this.createdAt;
        this.updatedBy = actorId;
    }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public Long employmentId() { return employmentId; }
    public Long organizationId() { return organizationId; }
    public Long departmentId() { return departmentId; }
    public Long positionId() { return positionId; }
    public String code() { return code; }
    public AssignmentType assignmentType() { return assignmentType; }
    public String specialtyCode() { return specialtyCode; }
    public boolean primaryAssignment() { return primaryAssignment; }
    public BigDecimal workloadPercent() { return workloadPercent; }
    public PersonnelStatus status() { return status; }
    public LocalDate validFrom() { return validFrom; }
    public LocalDate validTo() { return validTo; }
    public long revision() { return revision; }
}
