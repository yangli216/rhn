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
@Table(name = "RHN_SYS_STAFF_ASSIGN")
public class PersonnelAssignment {
    @Id @Column(name = "ID_STAFF_ASSIGN") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_EMPL", nullable = false) private Long employmentId;
    @Column(name = "ID_ORG", nullable = false) private Long organizationId;
    @Column(name = "ID_DEPT", nullable = false) private Long departmentId;
    @Column(name = "ID_POS", nullable = false) private Long positionId;
    @Column(name = "CD_STAFF_ASSIGN", nullable = false) private String code;
    @Enumerated(EnumType.STRING)
    @Column(name = "SD_ASSIGN_TYPE", nullable = false) private AssignmentType assignmentType;
    @Column(name = "CD_SPECLTY") private String specialtyCode;
    @Column(name = "FG_PRIMARY_ASSIGN", nullable = false) private boolean primaryAssignment;
    @Column(name = "WKLOAD_PERCENT") private BigDecimal workloadPercent;
    @Enumerated(EnumType.STRING) @Column(name = "SD_STATUS", nullable = false) private PersonnelStatus status;
    @Column(name = "DA_VALID_FROM", nullable = false) private LocalDate validFrom;
    @Column(name = "DA_VALID_TO") private LocalDate validTo;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED") private Long createdBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED") private Long updatedBy;
    @Version @Column(name = "REVISION", nullable = false) private long revision;

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
