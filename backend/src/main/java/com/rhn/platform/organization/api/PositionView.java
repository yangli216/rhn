package com.rhn.platform.organization.api;

import com.rhn.platform.organization.domain.PersonnelStatus;
import com.rhn.platform.organization.domain.PositionType;

public record PositionView(
        Long id, long revision, String code, String name,
        PositionType sdPositionType, String dutyDescription, PersonnelStatus sdPersonnelStatus
) {
}
