package com.rhn.platform.realtime.api;

import java.time.Instant;

public record PresenceUserView(Long userId, String username, Long practitionerId,
                               Long organizationId, String organizationName,
                               Long departmentId, String departmentName,
                               boolean active, Instant connectedAt, Instant lastSeenAt,
                               Instant lastActivityAt, int connectionCount) {}
