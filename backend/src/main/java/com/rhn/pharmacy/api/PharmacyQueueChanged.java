package com.rhn.pharmacy.api;

import java.time.Instant;

public record PharmacyQueueChanged(
        Long sourceEventId,
        Long tenantId,
        Long organizationId,
        Long departmentId,
        Long medicationRequestId,
        String changeType,
        Instant occurredAt) {}
