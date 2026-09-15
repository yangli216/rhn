package com.rhn.platform.eventing.api;

import java.time.Instant;
import java.util.Map;

/** Immutable, versioned contract shared by domain event producers and projectors. */
public record DomainEventEnvelope(
        Long eventId,
        Long tenantId,
        Long organizationId,
        String eventType,
        int eventVersion,
        String aggregateType,
        Long aggregateId,
        long aggregateVersion,
        Long subjectId,
        Instant occurredAt,
        Instant recordedAt,
        String actor,
        String source,
        String correlationId,
        Long causationId,
        Map<String, Object> payload,
        int schemaVersion
) {
}
