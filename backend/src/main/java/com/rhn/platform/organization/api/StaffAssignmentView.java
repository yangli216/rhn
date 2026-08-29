package com.rhn.platform.organization.api;

import com.rhn.platform.organization.domain.AssignmentType;
import com.rhn.platform.organization.domain.PersonnelStatus;
import com.rhn.platform.organization.domain.PositionType;

import java.math.BigDecimal;
import java.time.LocalDate;

public record StaffAssignmentView(
        Long id, long revision, Long employmentId,
        Long organizationId, String organizationName,
        Long departmentId, String departmentName,
        Long positionId, String positionName, PositionType sdPositionType, String code,
        AssignmentType sdAssignmentType, String specialtyCode,
        boolean primaryAssignment, BigDecimal workloadPercent,
        PersonnelStatus sdPersonnelStatus, LocalDate validFrom, LocalDate validTo
) {
}
