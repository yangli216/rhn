package com.rhn.healthcore.mpi;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PastOrPresent;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public record UpdateResidentProfileRequest(
        @PositiveOrZero long expectedVersion,
        @NotBlank @Size(max = 100) String fullName,
        @NotBlank @Pattern(regexp = "MALE|FEMALE|UNKNOWN") String gender,
        @NotNull @PastOrPresent LocalDate birthDate,
        @Pattern(regexp = "^$|^[0-9+ -]{6,32}$", message = "联系电话格式不正确") String phone,
        boolean deceased,
        Instant deceasedAt,
        @Valid DemographicProfileInput demographicProfile,
        @Size(max = 10) List<@Valid AddressInput> addresses,
        @Size(max = 20) List<@Valid RelatedPersonInput> relatedPersons,
        @Size(max = 10) List<@Valid CoverageInput> coverages,
        @Size(max = 5) List<@Valid EmploymentInput> employments
) {
    public record DemographicProfileInput(
            @Size(max = 32) String nationalityCode,
            @Size(max = 32) String ethnicityCode,
            @Size(max = 32) String sdResidencyType,
            @Size(max = 32) String sdMaritalStatus,
            @Size(max = 32) String sdEducationLevel,
            @Size(max = 64) String sdOccupationType,
            @Size(max = 16) String sdBloodType,
            @Size(max = 16) String sdRhType
    ) {}

    public record AddressInput(
            @NotBlank @Size(max = 32) String sdUse,
            @Pattern(regexp = "\\d{2}0{10}", message = "省级区划代码必须为12位，后10位补0") String provinceCode,
            @Pattern(regexp = "\\d{4}0{8}", message = "市级区划代码必须为12位，后8位补0") String cityCode,
            @Pattern(regexp = "\\d{6}0{6}", message = "县区级区划代码必须为12位，后6位补0") String districtCode,
            @Pattern(regexp = "\\d{9}0{3}", message = "街道乡镇区划代码必须为12位，后3位补0") String streetCode,
            @Pattern(regexp = "\\d{12}", message = "社区村区划代码必须为12位数字") String communityCode,
            @NotBlank @Size(max = 1000) String addressText,
            @Size(max = 16) String postalCode,
            boolean primary,
            @NotNull LocalDate validFrom,
            LocalDate validTo
    ) {}

    public record RelatedPersonInput(
            @NotBlank @Size(max = 100) String fullName,
            @NotBlank @Size(max = 32) String sdRelationship,
            @Pattern(regexp = "^$|^[0-9+ -]{6,32}$", message = "联系人电话格式不正确") String phone,
            @Size(max = 1000) String addressText,
            boolean guardian,
            boolean emergencyContact,
            @NotNull LocalDate validFrom,
            LocalDate validTo
    ) {}

    public record CoverageInput(
            @NotBlank @Size(max = 32) String sdCoverageType,
            @NotBlank @Size(max = 200) String payerName,
            @Size(max = 100) String memberNo,
            boolean primary,
            @NotNull LocalDate validFrom,
            LocalDate validTo
    ) {}

    public record EmploymentInput(
            @NotBlank @Size(max = 200) String employerName,
            @Size(max = 64) String sdOccupationType,
            @Pattern(regexp = "^$|^[0-9+ -]{6,32}$", message = "单位电话格式不正确") String phone,
            @Size(max = 16) String postalCode,
            @Size(max = 1000) String addressText,
            boolean primary,
            @NotNull LocalDate validFrom,
            LocalDate validTo
    ) {}
}
