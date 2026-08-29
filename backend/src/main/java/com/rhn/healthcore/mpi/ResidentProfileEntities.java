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
@Table(name = "resident_demographic_profiles")
class ResidentDemographicProfile {
    @Id @Column(name = "resident_id") private Long residentId;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "nationality_code") private String nationalityCode;
    @Column(name = "ethnicity_code") private String ethnicityCode;
    @Column(name = "residency_type_code") private String residencyTypeCode;
    @Column(name = "marital_status_code") private String maritalStatusCode;
    @Column(name = "education_code") private String educationCode;
    @Column(name = "occupation_code") private String occupationCode;
    @Column(name = "blood_type_code") private String bloodTypeCode;
    @Column(name = "rh_type_code") private String rhTypeCode;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "updated_by", nullable = false) private String updatedBy;

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
@Table(name = "resident_employments")
class ResidentEmployment {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "resident_id", nullable = false) private Long residentId;
    @Column(name = "employer_name", nullable = false) private String employerName;
    @Column(name = "occupation_code") private String occupationCode;
    private String phone;
    @Column(name = "postal_code") private String postalCode;
    @Column(name = "address_text") private String addressText;
    @Column(name = "primary_flag", nullable = false) private boolean primary;
    @Column(name = "valid_from", nullable = false) private LocalDate validFrom;
    @Column(name = "valid_to") private LocalDate validTo;
    @Column(nullable = false) private String status;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "created_by", nullable = false) private String createdBy;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "updated_by", nullable = false) private String updatedBy;

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
@Table(name = "resident_addresses")
class ResidentAddress {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "resident_id", nullable = false) private Long residentId;
    @Column(name = "use_code", nullable = false) private String useCode;
    @Column(name = "province_code") private String provinceCode;
    @Column(name = "city_code") private String cityCode;
    @Column(name = "district_code") private String districtCode;
    @Column(name = "street_code") private String streetCode;
    @Column(name = "community_code") private String communityCode;
    @Column(name = "address_text", nullable = false) private String addressText;
    @Column(name = "postal_code") private String postalCode;
    @Column(name = "primary_flag", nullable = false) private boolean primary;
    @Column(name = "valid_from", nullable = false) private LocalDate validFrom;
    @Column(name = "valid_to") private LocalDate validTo;
    @Column(nullable = false) private String status;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "created_by", nullable = false) private String createdBy;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "updated_by", nullable = false) private String updatedBy;

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
@Table(name = "resident_related_persons")
class ResidentRelatedPerson {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "resident_id", nullable = false) private Long residentId;
    @Column(name = "full_name", nullable = false) private String fullName;
    @Column(name = "relationship_code", nullable = false) private String relationshipCode;
    private String phone;
    @Column(name = "address_text") private String addressText;
    @Column(name = "guardian_flag", nullable = false) private boolean guardian;
    @Column(name = "emergency_contact_flag", nullable = false) private boolean emergencyContact;
    @Column(name = "valid_from", nullable = false) private LocalDate validFrom;
    @Column(name = "valid_to") private LocalDate validTo;
    @Column(nullable = false) private String status;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "created_by", nullable = false) private String createdBy;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "updated_by", nullable = false) private String updatedBy;

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
@Table(name = "resident_coverages")
class ResidentCoverage {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "resident_id", nullable = false) private Long residentId;
    @Column(name = "coverage_type_code", nullable = false) private String coverageTypeCode;
    @Column(name = "payer_name", nullable = false) private String payerName;
    @Column(name = "member_no") private String memberNo;
    @Column(name = "primary_flag", nullable = false) private boolean primary;
    @Column(name = "valid_from", nullable = false) private LocalDate validFrom;
    @Column(name = "valid_to") private LocalDate validTo;
    @Column(nullable = false) private String status;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "created_by", nullable = false) private String createdBy;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "updated_by", nullable = false) private String updatedBy;

    protected ResidentCoverage() {}

    ResidentCoverage(Long tenantId, Long residentId, UpdateResidentProfileRequest.CoverageInput input, String actor) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.residentId = residentId;
        this.coverageTypeCode = input.sdCoverageType().trim(); this.payerName = input.payerName().trim();
        this.memberNo = text(input.memberNo()); this.primary = input.primary();
        this.validFrom = input.validFrom(); this.validTo = input.validTo(); this.status = "ACTIVE";
        this.createdAt = Instant.now(); this.createdBy = actor; this.updatedAt = createdAt; this.updatedBy = actor;
    }

    Long id() { return id; } Long residentId() { return residentId; } String coverageTypeCode() { return coverageTypeCode; }
    String payerName() { return payerName; } String status() { return status; }
    String memberNo() { return memberNo; } boolean primary() { return primary; }
    LocalDate validFrom() { return validFrom; } LocalDate validTo() { return validTo; }
    private static String text(String value) { return value == null || value.isBlank() ? null : value.trim(); }
}
