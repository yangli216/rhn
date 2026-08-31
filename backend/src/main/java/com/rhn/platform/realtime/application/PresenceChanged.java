package com.rhn.platform.realtime.application;

import java.time.Instant;

public record PresenceChanged(Long tenantId, Long organizationId, Long departmentId,
                              String changeType, Instant occurredAt) {}
