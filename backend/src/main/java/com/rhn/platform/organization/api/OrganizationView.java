package com.rhn.platform.organization.api;

import com.rhn.platform.dictionary.api.DictionaryBinding;
import java.time.Instant;
import java.time.LocalDate;

public record OrganizationView(
        Long id, long revision, Long parentId, Long mergedToId, String code, String name,
        String shortName, String description,
        String sdOrgKind, String sdOrgType, String sdOrgStatus,
        @DictionaryBinding(OrganizationDictionaryCodes.PROPERTY) String sdOrgProperty,
        boolean virtual, int sortOrder, String timezoneCode,
        @DictionaryBinding(OrganizationDictionaryCodes.DEPARTMENT_TYPE) String sdDepartmentType,
        @DictionaryBinding(OrganizationDictionaryCodes.DEPARTMENT_PROPERTY) String sdDepartmentProperty,
        LocalDate validFrom, LocalDate validTo, Instant createdAt, Instant updatedAt
) {
}
