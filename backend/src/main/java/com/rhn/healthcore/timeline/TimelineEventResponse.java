package com.rhn.healthcore.timeline;

import com.rhn.shared.json.JsonCodec;
import tools.jackson.databind.JsonNode;

import java.time.Instant;

public record TimelineEventResponse(
        Long id,
        Long encounterId,
        String eventType,
        String summary,
        JsonNode details,
        Instant occurredAt,
        String recordedBy
) {
    static TimelineEventResponse from(HealthEvent event, JsonCodec jsonCodec) {
        return new TimelineEventResponse(event.id(), event.encounterId(), event.eventType(), event.summary(),
                jsonCodec.readTree(event.payloadJson()), event.occurredAt(), event.recordedBy());
    }
}
