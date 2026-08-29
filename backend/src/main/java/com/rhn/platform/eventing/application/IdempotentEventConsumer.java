package com.rhn.platform.eventing.application;

import com.rhn.platform.eventing.api.DomainEventEnvelope;
import com.rhn.platform.eventing.domain.EventConsumption;
import com.rhn.platform.eventing.infrastructure.EventConsumptionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class IdempotentEventConsumer {
    private final EventConsumptionRepository repository;

    public IdempotentEventConsumer(EventConsumptionRepository repository) {
        this.repository = repository;
    }

    @Transactional
    public boolean consume(String consumerName, DomainEventEnvelope event, Runnable action) {
        if (repository.existsByConsumerNameAndEventId(consumerName, event.eventId())) return false;
        action.run();
        repository.save(new EventConsumption(event.tenantId(), consumerName, event.eventId()));
        return true;
    }
}
