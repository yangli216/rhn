package com.rhn.platform.organization.api;

import com.rhn.platform.dictionary.api.DictionaryBinding;
import com.rhn.platform.organization.domain.OrganizationKind;
import com.rhn.platform.organization.domain.OrganizationStatus;
import com.rhn.platform.organization.domain.OrganizationType;

import java.time.Instant;
import java.time.LocalDate;

public record OrganizationView(
        Long id, long revision, Long parentId, Long mergedToId, String code, String name,
        String shortName, String description,
        OrganizationKind sdOrgKind, OrganizationType sdOrgType, OrganizationStatus sdOrgStatus,
        @DictionaryBinding(OrganizationDictionaryCodes.PROPERTY) String sdOrgProperty,
        boolean virtual, int sortOrder, String timezoneCode,
        @DictionaryBinding(OrganizationDictionaryCodes.DEPARTMENT_TYPE) String sdDepartmentType,
        @DictionaryBinding(OrganizationDictionaryCodes.DEPARTMENT_PROPERTY) String sdDepartmentProperty,
        LocalDate validFrom, LocalDate validTo, Instant createdAt, Instant updatedAt
) {
}
