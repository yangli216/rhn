package com.rhn.platform.organization.api;

import java.math.BigDecimal;
import java.time.LocalDate;

public record StaffAssignmentView(
        Long id, long revision, Long employmentId,
        Long practitionerId, String practitionerCode, String practitionerName, String sdPractGender,
        Long organizationId, String organizationName,
        Long departmentId, String departmentName,
        Long positionId, String positionName, String sdPositionType, String code,
        String sdAssignmentType, String specialtyCode,
        boolean primaryAssignment, BigDecimal workloadPercent,
        String sdPersonnelStatus, LocalDate validFrom, LocalDate validTo
) {
}
