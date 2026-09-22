package com.rhn.healthcore.mpi;

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
@Table(name = "RHN_PI_PAT")
class Resident {
    @Id
    @Column(name = "ID_PAT") private Long id;
    @Column(name = "ID_TNT", nullable = false)
    private Long tenantId;
    @Column(name = "CD_HEALTH_RECORD_NO", nullable = false)
    private String healthRecordNo;
    @Column(name = "NA_FULL", nullable = false)
    private String fullName;
    @Column(name = "ID_NATL")
    private String nationalId;
    @Column(name = "SD_GENDER", nullable = false)
    private String gender;
    @Column(name = "DA_BIRTH", nullable = false)
    private LocalDate birthDate;
    @Column(name = "CD_PHONE") private String phone;
    @Column(name = "FG_DCD", nullable = false)
    private boolean deceased;
    @Column(name = "DT_DCD")
    private Instant deceasedAt;
    @Column(name = "DT_CREATED", nullable = false)
    private Instant createdAt;
    @Column(name = "ID_USER_CREATED", nullable = false)
    private String createdBy;
    @Enumerated(EnumType.STRING)
    @Column(name = "SD_STATUS", nullable = false)
    private ResidentStatus status;
    @Column(name = "ID_PAT_MERGED_INTO")
    private Long mergedIntoId;
    @Column(name = "DT_UPDATED", nullable = false)
    private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED", nullable = false)
    private String updatedBy;
    @Version
    @Column(name = "REVISION") private long version;

    protected Resident() {
    }

    Resident(Long tenantId, String healthRecordNo, String fullName, String nationalId,
             String gender, LocalDate birthDate, String phone, String createdBy) {
        this.id = com.rhn.shared.id.GlobalIds.next();
        this.tenantId = tenantId;
        this.healthRecordNo = healthRecordNo;
        this.fullName = fullName;
        this.nationalId = nationalId;
        this.gender = gender;
        this.birthDate = birthDate;
        this.phone = phone;
        this.createdAt = Instant.now();
        this.createdBy = createdBy;
        this.status = ResidentStatus.ACTIVE;
        this.updatedAt = this.createdAt;
        this.updatedBy = createdBy;
    }

    void mergeInto(Long survivingResidentId) {
        if (status != ResidentStatus.ACTIVE) {
            throw new IllegalStateException("Only active residents can be merged");
        }
        this.status = ResidentStatus.MERGED;
        this.mergedIntoId = survivingResidentId;
        this.updatedAt = Instant.now();
        this.updatedBy = createdBy;
    }

    void restoreFromMerge() {
        if (status != ResidentStatus.MERGED) {
            throw new IllegalStateException("Only merged residents can be restored");
        }
        this.status = ResidentStatus.ACTIVE;
        this.mergedIntoId = null;
        this.updatedAt = Instant.now();
        this.updatedBy = createdBy;
    }

    void updateProfile(String fullName, String gender, LocalDate birthDate, String phone,
                       boolean deceased, Instant deceasedAt, String updatedBy) {
        this.fullName = fullName;
        this.gender = gender;
        this.birthDate = birthDate;
        this.phone = phone;
        this.deceased = deceased;
        this.deceasedAt = deceased ? deceasedAt : null;
        this.updatedAt = Instant.now();
        this.updatedBy = updatedBy;
    }

    Long id() { return id; }
    Long tenantId() { return tenantId; }
    String healthRecordNo() { return healthRecordNo; }
    String fullName() { return fullName; }
    String nationalId() { return nationalId; }
    String gender() { return gender; }
    LocalDate birthDate() { return birthDate; }
    String phone() { return phone; }
    boolean deceased() { return deceased; }
    Instant deceasedAt() { return deceasedAt; }
    Instant createdAt() { return createdAt; }
    ResidentStatus status() { return status; }
    Long mergedIntoId() { return mergedIntoId; }
    Instant updatedAt() { return updatedAt; }
    String updatedBy() { return updatedBy; }
    long version() { return version; }
}
