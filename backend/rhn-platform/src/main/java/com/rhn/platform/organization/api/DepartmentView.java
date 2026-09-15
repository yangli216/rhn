package com.rhn.platform.organization.api;

import com.rhn.platform.dictionary.api.DictionaryBinding;
import java.time.LocalDate;

public record DepartmentView(
        Long id, long revision, Long organizationId, Long parentId, Long mergedToId,
        String code, String name, String shortName, String description,
        @DictionaryBinding(OrganizationDictionaryCodes.DEPARTMENT_TYPE) String sdDepartmentType,
        @DictionaryBinding(OrganizationDictionaryCodes.DEPARTMENT_PROPERTY) String sdDepartmentProperty,
        String sdOrgType, boolean virtual, int sortOrder,
        String sdOrgStatus,
        LocalDate validFrom, LocalDate validTo, java.time.Instant createdAt, java.time.Instant updatedAt
) {
}
