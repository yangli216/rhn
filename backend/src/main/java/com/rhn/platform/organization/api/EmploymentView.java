package com.rhn.platform.organization.api;

import com.rhn.platform.organization.domain.EmploymentType;
import com.rhn.platform.organization.domain.PersonnelStatus;

import java.time.LocalDate;

public record EmploymentView(
        Long id, long revision, Long practitionerId,
        Long organizationId, String organizationName, String code,
        EmploymentType sdEmploymentType, boolean primaryEmployment,
        LocalDate hireDate, LocalDate leaveDate, PersonnelStatus sdPersonnelStatus
) {
}
