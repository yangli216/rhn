package com.rhn.healthcore.mpi;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.time.LocalDate;

final class ResidentProfileEntities {
    private ResidentProfileEntities() {}
}

@Entity
@Table(name = "RHN_PI_PAT_DEMO_PROF")
class ResidentDemographicProfile {
    @Id @Column(name = "ID_PAT") private Long residentId;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "CD_NATLTY") private String nationalityCode;
    @Column(name = "CD_ETHNIC") private String ethnicityCode;
    @Column(name = "CD_RESDNCY_TYPE") private String residencyTypeCode;
    @Column(name = "CD_MARITAL_STATUS") private String maritalStatusCode;
    @Column(name = "CD_EDUC") private String educationCode;
    @Column(name = "CD_OCCUPN") private String occupationCode;
    @Column(name = "CD_BLOOD_TYPE") private String bloodTypeCode;
    @Column(name = "CD_RH_TYPE") private String rhTypeCode;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED", nullable = false) private String updatedBy;

    protected ResidentDemographicProfile() {}

    ResidentDemographicProfile(Long tenantId, Long residentId) {
        this.tenantId = tenantId;
        this.residentId = residentId;
    }

    void update(UpdateResidentProfileRequest.DemographicProfileInput value, String actor) {
        this.nationalityCode = text(value == null ? null : value.nationalityCode());
        this.ethnicityCode = text(value == null ? null : value.ethnicityCode());
        this.residencyTypeCode = text(value == null ? null : value.sdResidencyType());
        this.maritalStatusCode = text(value == null ? null : value.sdMaritalStatus());
        this.educationCode = text(value == null ? null : value.sdEducationLevel());
        this.occupationCode = text(value == null ? null : value.sdOccupationType());
        this.bloodTypeCode = text(value == null ? null : value.sdBloodType());
        this.rhTypeCode = text(value == null ? null : value.sdRhType());
        this.updatedAt = Instant.now();
        this.updatedBy = actor;
    }

    String nationalityCode() { return nationalityCode; }
    String ethnicityCode() { return ethnicityCode; }
    String residencyTypeCode() { return residencyTypeCode; }
    String maritalStatusCode() { return maritalStatusCode; }
    String educationCode() { return educationCode; }
    String occupationCode() { return occupationCode; }
    String bloodTypeCode() { return bloodTypeCode; }
    String rhTypeCode() { return rhTypeCode; }

    private static String text(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}

@Entity
@Table(name = "RHN_PI_PAT_EMPL")
class ResidentEmployment {
    @Id @Column(name = "ID_PAT_EMPL") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_PAT", nullable = false) private Long residentId;
    @Column(name = "NA_EMPLYR", nullable = false) private String employerName;
    @Column(name = "CD_OCCUPN") private String occupationCode;
    @Column(name = "CD_PHONE") private String phone;
    @Column(name = "CD_POSTAL") private String postalCode;
    @Column(name = "DES_ADDRESS") private String addressText;
    @Column(name = "FG_PRIMARY_FLAG", nullable = false) private boolean primary;
    @Column(name = "DA_VALID_FROM", nullable = false) private LocalDate validFrom;
    @Column(name = "DA_VALID_TO") private LocalDate validTo;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED", nullable = false) private String createdBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED", nullable = false) private String updatedBy;

    protected ResidentEmployment() {}

    ResidentEmployment(Long tenantId, Long residentId, UpdateResidentProfileRequest.EmploymentInput input,
                       String actor) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.residentId = residentId;
        this.employerName = input.employerName().trim(); this.occupationCode = text(input.sdOccupationType());
        this.phone = text(input.phone()); this.postalCode = text(input.postalCode());
        this.addressText = text(input.addressText()); this.primary = input.primary();
        this.validFrom = input.validFrom(); this.validTo = input.validTo(); this.status = "ACTIVE";
        this.createdAt = Instant.now(); this.createdBy = actor; this.updatedAt = createdAt; this.updatedBy = actor;
    }

    Long id() { return id; } String employerName() { return employerName; } String occupationCode() { return occupationCode; }
    String phone() { return phone; } String postalCode() { return postalCode; } String addressText() { return addressText; }
    boolean primary() { return primary; } LocalDate validFrom() { return validFrom; } LocalDate validTo() { return validTo; }
    private static String text(String value) { return value == null || value.isBlank() ? null : value.trim(); }
}

@Entity
@Table(name = "RHN_PI_PAT_ADDR")
class ResidentAddress {
    @Id @Column(name = "ID_PAT_ADDR") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_PAT", nullable = false) private Long residentId;
    @Column(name = "CD_USE", nullable = false) private String useCode;
    @Column(name = "CD_PROV") private String provinceCode;
    @Column(name = "CD_CITY") private String cityCode;
    @Column(name = "CD_DIST") private String districtCode;
    @Column(name = "CD_STREET") private String streetCode;
    @Column(name = "CD_COMM") private String communityCode;
    @Column(name = "DES_ADDRESS", nullable = false) private String addressText;
    @Column(name = "CD_POSTAL") private String postalCode;
    @Column(name = "FG_PRIMARY_FLAG", nullable = false) private boolean primary;
    @Column(name = "DA_VALID_FROM", nullable = false) private LocalDate validFrom;
    @Column(name = "DA_VALID_TO") private LocalDate validTo;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED", nullable = false) private String createdBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED", nullable = false) private String updatedBy;

    protected ResidentAddress() {}

    ResidentAddress(Long tenantId, Long residentId, UpdateResidentProfileRequest.AddressInput input, String actor) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.residentId = residentId;
        this.useCode = input.sdUse().trim(); this.provinceCode = text(input.provinceCode());
        this.cityCode = text(input.cityCode()); this.districtCode = text(input.districtCode());
        this.streetCode = text(input.streetCode()); this.communityCode = text(input.communityCode());
        this.addressText = input.addressText().trim();
        this.postalCode = text(input.postalCode()); this.primary = input.primary();
        this.validFrom = input.validFrom(); this.validTo = input.validTo(); this.status = "ACTIVE";
        this.createdAt = Instant.now(); this.createdBy = actor; this.updatedAt = createdAt; this.updatedBy = actor;
    }

    Long id() { return id; } String useCode() { return useCode; }
    String provinceCode() { return provinceCode; } String cityCode() { return cityCode; }
    String districtCode() { return districtCode; } String streetCode() { return streetCode; }
    String communityCode() { return communityCode; }
    String addressText() { return addressText; } String postalCode() { return postalCode; }
    boolean primary() { return primary; } LocalDate validFrom() { return validFrom; } LocalDate validTo() { return validTo; }
    private static String text(String value) { return value == null || value.isBlank() ? null : value.trim(); }
}

@Entity
@Table(name = "RHN_PI_PAT_RELATED_PERSON")
class ResidentRelatedPerson {
    @Id @Column(name = "ID_PAT_RELATED_PERSON") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_PAT", nullable = false) private Long residentId;
    @Column(name = "NA_FULL", nullable = false) private String fullName;
    @Column(name = "CD_RELSHIP", nullable = false) private String relationshipCode;
    @Column(name = "CD_PHONE") private String phone;
    @Column(name = "DES_ADDRESS") private String addressText;
    @Column(name = "FG_GUARD_FLAG", nullable = false) private boolean guardian;
    @Column(name = "FG_EMERG_CONTACT_FLAG", nullable = false) private boolean emergencyContact;
    @Column(name = "DA_VALID_FROM", nullable = false) private LocalDate validFrom;
    @Column(name = "DA_VALID_TO") private LocalDate validTo;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED", nullable = false) private String createdBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED", nullable = false) private String updatedBy;

    protected ResidentRelatedPerson() {}

    ResidentRelatedPerson(Long tenantId, Long residentId, UpdateResidentProfileRequest.RelatedPersonInput input,
                          String actor) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.residentId = residentId;
        this.fullName = input.fullName().trim(); this.relationshipCode = input.sdRelationship().trim();
        this.phone = text(input.phone()); this.addressText = text(input.addressText());
        this.guardian = input.guardian(); this.emergencyContact = input.emergencyContact();
        this.validFrom = input.validFrom(); this.validTo = input.validTo(); this.status = "ACTIVE";
        this.createdAt = Instant.now(); this.createdBy = actor; this.updatedAt = createdAt; this.updatedBy = actor;
    }

    Long id() { return id; } String fullName() { return fullName; } String relationshipCode() { return relationshipCode; }
    String phone() { return phone; } String addressText() { return addressText; } boolean guardian() { return guardian; }
    boolean emergencyContact() { return emergencyContact; } LocalDate validFrom() { return validFrom; } LocalDate validTo() { return validTo; }
    private static String text(String value) { return value == null || value.isBlank() ? null : value.trim(); }
}

@Entity
@Table(name = "RHN_INS_PAT_COVER")
class ResidentCoverage {
    @Id @Column(name = "ID_PAT_COVER") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_PAT", nullable = false) private Long residentId;
    @Column(name = "CD_COVER_TYPE", nullable = false) private String coverageTypeCode;
    @Column(name = "NA_PAYER", nullable = false) private String payerName;
    @Column(name = "CD_MEMBER_NO") private String memberNo;
    @Column(name = "FG_PRIMARY_FLAG", nullable = false) private boolean primary;
    @Column(name = "DA_VALID_FROM", nullable = false) private LocalDate validFrom;
    @Column(name = "DA_VALID_TO") private LocalDate validTo;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED", nullable = false) private String createdBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED", nullable = false) private String updatedBy;

    protected ResidentCoverage() {}

    ResidentCoverage(Long tenantId, Long residentId, UpdateResidentProfileRequest.CoverageInput input, String actor) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.residentId = residentId;
        this.coverageTypeCode = input.sdCoverageType().trim(); this.payerName = input.payerName().trim();
        this.memberNo = text(input.memberNo()); this.primary = input.primary();
        this.validFrom = input.validFrom(); this.validTo = input.validTo(); this.status = "ACTIVE";
        this.createdAt = Instant.now(); this.createdBy = actor; this.updatedAt = createdAt; this.updatedBy = actor;
    }

    ResidentCoverage(Long tenantId, Long residentId, String coverageTypeCode, String payerName,
                     String memberNo, boolean primary, LocalDate validFrom, LocalDate validTo, String actor) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.residentId = residentId;
        this.coverageTypeCode = coverageTypeCode.trim(); this.payerName = payerName.trim();
        this.memberNo = text(memberNo); this.primary = primary;
        this.validFrom = validFrom != null ? validFrom : LocalDate.of(2020, 1, 1);
        this.validTo = validTo; this.status = "ACTIVE";
        this.createdAt = Instant.now(); this.createdBy = actor; this.updatedAt = createdAt; this.updatedBy = actor;
    }

    Long id() { return id; } Long residentId() { return residentId; } String coverageTypeCode() { return coverageTypeCode; }
    String payerName() { return payerName; } String status() { return status; }
    String memberNo() { return memberNo; } boolean primary() { return primary; }
    LocalDate validFrom() { return validFrom; } LocalDate validTo() { return validTo; }
    private static String text(String value) { return value == null || value.isBlank() ? null : value.trim(); }
}
