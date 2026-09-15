package com.rhn.platform.organization.api;

import java.time.LocalDate;

public record EmploymentView(
        Long id, long revision, Long practitionerId,
        Long organizationId, String organizationName, String code,
        String sdEmploymentType, boolean primaryEmployment,
        LocalDate hireDate, LocalDate leaveDate, String sdPersonnelStatus
) {
}
