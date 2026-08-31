package com.rhn.platform.realtime.api;

import java.time.Instant;
import java.util.Map;

/** Minimal browser invalidation signal. Business data remains available from authorized REST resources. */
public record RealtimeEvent(
        String id,
        String type,
        Instant occurredAt,
        String severity,
        Long organizationId,
        Long departmentId,
        Long recipientUserId,
        String resourceType,
        Long resourceId,
        String routePath,
        Map<String, Object> attributes
) {
    public RealtimeEvent {
        attributes = attributes == null ? Map.of() : Map.copyOf(attributes);
    }
}
