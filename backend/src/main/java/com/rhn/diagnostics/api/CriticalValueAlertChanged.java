package com.rhn.diagnostics.api;

import java.time.Instant;

public record CriticalValueAlertChanged(
        Long eventId,
        Long tenantId,
        Long organizationId,
        Long departmentId,
        Long recipientUserId,
        Long alertId,
        Long encounterId,
        String changeType,
        Instant occurredAt
) {}
