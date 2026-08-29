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
@Table(name = "residents")
class Resident {
    @Id
    private Long id;
    @Column(name = "tenant_id", nullable = false)
    private Long tenantId;
    @Column(name = "health_record_no", nullable = false)
    private String healthRecordNo;
    @Column(name = "full_name", nullable = false)
    private String fullName;
    @Column(name = "national_id")
    private String nationalId;
    @Column(nullable = false)
    private String gender;
    @Column(name = "birth_date", nullable = false)
    private LocalDate birthDate;
    private String phone;
    @Column(nullable = false)
    private boolean deceased;
    @Column(name = "deceased_at")
    private Instant deceasedAt;
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;
    @Column(name = "created_by", nullable = false)
    private String createdBy;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ResidentStatus status;
    @Column(name = "merged_into_id")
    private Long mergedIntoId;
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
    @Column(name = "updated_by", nullable = false)
    private String updatedBy;
    @Version
    private long version;

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
