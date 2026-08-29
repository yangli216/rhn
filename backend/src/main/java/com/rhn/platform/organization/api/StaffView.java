package com.rhn.platform.organization.api;

import com.rhn.platform.organization.domain.PersonnelStatus;
import com.rhn.platform.organization.domain.PractitionerGender;

import java.time.Instant;

public record StaffView(
        Long id, long revision, String code, String fullName,
        PractitionerGender sdPractGender, PersonnelStatus sdPersonnelStatus,
        Instant createdAt, Instant updatedAt
) {
}
