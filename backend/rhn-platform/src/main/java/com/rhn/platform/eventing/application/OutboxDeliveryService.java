package com.rhn.platform.eventing.application;

import com.rhn.platform.eventing.domain.OutboxEvent;
import com.rhn.platform.eventing.infrastructure.OutboxEventRepository;
import com.rhn.shared.json.JsonCodec;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
class OutboxDeliveryService {
    private final OutboxEventRepository repository;
    private final ApplicationEventPublisher publisher;
    private final JsonCodec jsonCodec;

    OutboxDeliveryService(OutboxEventRepository repository, ApplicationEventPublisher publisher, JsonCodec jsonCodec) {
        this.repository = repository;
        this.publisher = publisher;
        this.jsonCodec = jsonCodec;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void deliver(Long eventId, String workerId) {
        OutboxEvent event = repository.lockByEventId(eventId).orElse(null);
        if (event == null || !"PENDING".equals(event.publicationStatus()) || !workerId.equals(event.claimedBy())) return;
        try {
            publisher.publishEvent(event.envelope(jsonCodec));
            event.markPublished();
        } catch (RuntimeException error) {
            event.markFailed(error);
        }
    }
}
