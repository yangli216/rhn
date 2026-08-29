package com.rhn.platform.organization.api;

import com.rhn.platform.dictionary.api.DictionaryBinding;

import java.time.LocalDate;
import java.util.List;

public record DepartmentProfileView(
        DepartmentView department,
        List<DepartmentContact> contacts,
        List<DepartmentRelation> relations,
        List<DepartmentCapability> capabilities,
        List<DepartmentResponsibility> responsibilities
) {
    public record DepartmentContact(
            Long id,
            @DictionaryBinding(OrganizationDictionaryCodes.CONTACT_TYPE) String sdContactType,
            String contactValue,
            @DictionaryBinding(OrganizationDictionaryCodes.CONTACT_USE) String sdContactUse,
            boolean primaryContact, int sortOrder, LocalDate validFrom, LocalDate validTo,
            @DictionaryBinding(OrganizationDictionaryCodes.DETAIL_STATUS) String sdDetailStatus
    ) {}

    public record DepartmentRelation(
            Long id, Long targetDepartmentId, String targetDepartmentName,
            @DictionaryBinding(OrganizationDictionaryCodes.DEPARTMENT_RELATION_TYPE) String sdRelationType,
            boolean primaryRelation, String description, LocalDate validFrom, LocalDate validTo,
            @DictionaryBinding(OrganizationDictionaryCodes.DETAIL_STATUS) String sdDetailStatus
    ) {}

    public record DepartmentCapability(
            Long id,
            @DictionaryBinding(OrganizationDictionaryCodes.DEPARTMENT_CAPABILITY_TYPE) String sdCapabilityType,
            String qualificationBasisCode, String capabilityScope, LocalDate validFrom, LocalDate validTo,
            @DictionaryBinding(OrganizationDictionaryCodes.VERIFY_STATUS) String sdVerifyStatus,
            @DictionaryBinding(OrganizationDictionaryCodes.DETAIL_STATUS) String sdDetailStatus
    ) {}

    public record DepartmentResponsibility(
            Long id, Long assignmentId, String responsibleName,
            @DictionaryBinding(OrganizationDictionaryCodes.DEPARTMENT_RESPONSIBILITY_TYPE) String sdResponsibilityType,
            boolean primaryResponsibility, LocalDate validFrom, LocalDate validTo,
            @DictionaryBinding(OrganizationDictionaryCodes.DETAIL_STATUS) String sdDetailStatus
    ) {}
}
