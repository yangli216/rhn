package com.rhn.healthcore.timeline;

import com.rhn.platform.eventing.api.DomainEventEnvelope;
import com.rhn.shared.json.JsonCodec;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

@Component
class HealthTimelineProjector {
    private final HealthEventRepository repository;
    private final JsonCodec jsonCodec;

    HealthTimelineProjector(HealthEventRepository repository, JsonCodec jsonCodec) {
        this.repository = repository;
        this.jsonCodec = jsonCodec;
    }

    @EventListener
    void on(DomainEventEnvelope event) {
        if (event.subjectId() == null || repository.existsBySourceEventId(event.eventId())) {
            return;
        }
        repository.save(new HealthEvent(event, jsonCodec.write(event.payload())));
    }
}
