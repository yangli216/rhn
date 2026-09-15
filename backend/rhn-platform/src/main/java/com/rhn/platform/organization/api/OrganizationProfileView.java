package com.rhn.platform.organization.api;

import com.rhn.platform.dictionary.api.DictionaryBinding;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public record OrganizationProfileView(
        OrganizationView organization,
        List<Identifier> identifiers,
        List<Contact> contacts,
        List<Address> addresses,
        List<Relation> relations,
        List<Capability> capabilities,
        List<Responsibility> responsibilities
) {
    public record Identifier(
            Long id, String identifierSystem, String identifierCode,
            @DictionaryBinding(OrganizationDictionaryCodes.IDENTIFIER_TYPE) String sdIdentifierType,
            Long issuerOrganizationId, boolean primaryIdentifier,
            LocalDate validFrom, LocalDate validTo,
            @DictionaryBinding(OrganizationDictionaryCodes.VERIFY_STATUS) String sdVerifyStatus,
            Instant verifiedAt, Long verifiedBy,
            @DictionaryBinding(OrganizationDictionaryCodes.DETAIL_STATUS) String sdDetailStatus
    ) {}

    public record Contact(
            Long id,
            @DictionaryBinding(OrganizationDictionaryCodes.CONTACT_TYPE) String sdContactType,
            String contactValue,
            @DictionaryBinding(OrganizationDictionaryCodes.CONTACT_USE) String sdContactUse,
            boolean primaryContact, int sortOrder, LocalDate validFrom, LocalDate validTo,
            @DictionaryBinding(OrganizationDictionaryCodes.DETAIL_STATUS) String sdDetailStatus
    ) {}

    public record Address(
            Long id,
            @DictionaryBinding(OrganizationDictionaryCodes.ADDRESS_TYPE) String sdAddressType,
            String countryCode, String provinceCode, String cityCode, String districtCode,
            String streetAddress, String postalCode, LocalDate validFrom, LocalDate validTo,
            @DictionaryBinding(OrganizationDictionaryCodes.DETAIL_STATUS) String sdDetailStatus
    ) {}

    public record Relation(
            Long id, Long targetOrganizationId, String targetOrganizationName,
            @DictionaryBinding(OrganizationDictionaryCodes.RELATION_TYPE) String sdRelationType,
            boolean primaryRelation, String description, LocalDate validFrom, LocalDate validTo,
            @DictionaryBinding(OrganizationDictionaryCodes.DETAIL_STATUS) String sdDetailStatus
    ) {}

    public record Capability(
            Long id,
            @DictionaryBinding(OrganizationDictionaryCodes.CAPABILITY_TYPE) String sdCapabilityType,
            String qualificationBasisCode, String capabilityScope, LocalDate validFrom, LocalDate validTo,
            @DictionaryBinding(OrganizationDictionaryCodes.VERIFY_STATUS) String sdVerifyStatus,
            @DictionaryBinding(OrganizationDictionaryCodes.DETAIL_STATUS) String sdDetailStatus
    ) {}

    public record Responsibility(
            Long id, Long assignmentId, String responsibleName,
            @DictionaryBinding(OrganizationDictionaryCodes.RESPONSIBILITY_TYPE) String sdResponsibilityType,
            boolean primaryResponsibility, LocalDate validFrom, LocalDate validTo,
            @DictionaryBinding(OrganizationDictionaryCodes.DETAIL_STATUS) String sdDetailStatus
    ) {}
}
