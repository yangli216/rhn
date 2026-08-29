package com.rhn.healthcore.mpi;

import com.rhn.platform.dictionary.api.DictionaryBinding;

import java.time.LocalDate;
import java.util.List;

public record ResidentProfileResponse(
        ResidentResponse resident,
        DemographicProfileView demographicProfile,
        List<AddressView> addresses,
        List<RelatedPersonView> relatedPersons,
        List<CoverageView> coverages,
        List<EmploymentView> employments
) {
    static ResidentProfileResponse from(ResidentResponse resident, ResidentDemographicProfile profile,
                                        List<ResidentAddress> addresses,
                                        List<ResidentRelatedPerson> relatedPersons,
                                        List<ResidentCoverage> coverages,
                                        List<ResidentEmployment> employments) {
        return new ResidentProfileResponse(resident, DemographicProfileView.from(profile),
                addresses.stream().map(AddressView::from).toList(),
                relatedPersons.stream().map(RelatedPersonView::from).toList(),
                coverages.stream().map(CoverageView::from).toList(),
                employments.stream().map(EmploymentView::from).toList());
    }

    public record DemographicProfileView(
            String nationalityCode, String ethnicityCode,
            @DictionaryBinding("PI_RESIDENCY_TYPE") String sdResidencyType,
            @DictionaryBinding("PI_MARITAL_STATUS") String sdMaritalStatus,
            @DictionaryBinding("PI_EDUCATION_LEVEL") String sdEducationLevel,
            @DictionaryBinding("PI_OCCUPATION_TYPE") String sdOccupationType,
            @DictionaryBinding("PI_BLOOD_TYPE") String sdBloodType,
            @DictionaryBinding("PI_RH_TYPE") String sdRhType
    ) {
        static DemographicProfileView from(ResidentDemographicProfile value) {
            return value == null ? new DemographicProfileView(null, null, null, null, null, null, null, null)
                    : new DemographicProfileView(value.nationalityCode(), value.ethnicityCode(),
                    value.residencyTypeCode(), value.maritalStatusCode(), value.educationCode(), value.occupationCode(),
                    value.bloodTypeCode(), value.rhTypeCode());
        }
    }

    public record AddressView(Long id, @DictionaryBinding("PI_ADDRESS_USE") String sdUse,
                              String provinceCode, String cityCode,
                              String districtCode, String streetCode, String communityCode, String addressText, String postalCode,
                              boolean primary, LocalDate validFrom, LocalDate validTo) {
        static AddressView from(ResidentAddress value) {
            return new AddressView(value.id(), value.useCode(), value.provinceCode(), value.cityCode(),
                    value.districtCode(), value.streetCode(), value.communityCode(), value.addressText(), value.postalCode(),
                    value.primary(), value.validFrom(), value.validTo());
        }
    }

    public record RelatedPersonView(Long id, String fullName,
                                    @DictionaryBinding("PI_RELATED_PERSON_RELATIONSHIP") String sdRelationship,
                                    String phone,
                                    String addressText, boolean guardian, boolean emergencyContact,
                                    LocalDate validFrom, LocalDate validTo) {
        static RelatedPersonView from(ResidentRelatedPerson value) {
            return new RelatedPersonView(value.id(), value.fullName(), value.relationshipCode(), value.phone(),
                    value.addressText(), value.guardian(), value.emergencyContact(), value.validFrom(), value.validTo());
        }
    }

    public record CoverageView(Long id,
                               @DictionaryBinding("INS_COVERAGE_TYPE") String sdCoverageType,
                               String payerName, String memberNo,
                               boolean primary, LocalDate validFrom, LocalDate validTo) {
        static CoverageView from(ResidentCoverage value) {
            return new CoverageView(value.id(), value.coverageTypeCode(), value.payerName(), value.memberNo(),
                    value.primary(), value.validFrom(), value.validTo());
        }
    }

    public record EmploymentView(Long id, String employerName,
                                 @DictionaryBinding("PI_OCCUPATION_TYPE") String sdOccupationType,
                                 String phone, String postalCode, String addressText,
                                 boolean primary, LocalDate validFrom, LocalDate validTo) {
        static EmploymentView from(ResidentEmployment value) {
            return new EmploymentView(value.id(), value.employerName(), value.occupationCode(), value.phone(),
                    value.postalCode(), value.addressText(), value.primary(), value.validFrom(), value.validTo());
        }
    }
}
