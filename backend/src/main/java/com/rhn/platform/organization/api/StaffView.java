package com.rhn.platform.organization.api;

import java.time.Instant;

public record StaffView(
        Long id, long revision, String code, String fullName,
        String sdPractGender, String sdPersonnelStatus,
        Instant createdAt, Instant updatedAt
) {
}
