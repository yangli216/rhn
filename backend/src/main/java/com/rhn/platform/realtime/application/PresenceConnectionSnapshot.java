package com.rhn.platform.realtime.application;

import java.time.Instant;

public record PresenceConnectionSnapshot(String connectionId, String instanceId, String clientSessionId,
                                         Long tenantId, Long userId, String username,
                                         Long practitionerId, Long organizationId, Long departmentId,
                                         Instant connectedAt, Instant lastSeenAt, Instant lastActivityAt) {}
