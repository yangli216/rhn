package com.rhn.platform.organization.api;

import com.rhn.platform.dictionary.api.DictionaryBinding;
import com.rhn.platform.organization.domain.OrganizationStatus;
import com.rhn.platform.organization.domain.OrganizationType;

import java.time.LocalDate;

public record DepartmentView(
        Long id, long revision, Long organizationId, Long parentId, Long mergedToId,
        String code, String name, String shortName, String description,
        @DictionaryBinding(OrganizationDictionaryCodes.DEPARTMENT_TYPE) String sdDepartmentType,
        @DictionaryBinding(OrganizationDictionaryCodes.DEPARTMENT_PROPERTY) String sdDepartmentProperty,
        OrganizationType sdOrgType, boolean virtual, int sortOrder,
        OrganizationStatus sdOrgStatus,
        LocalDate validFrom, LocalDate validTo, java.time.Instant createdAt, java.time.Instant updatedAt
) {
}
