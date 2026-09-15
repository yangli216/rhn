package com.rhn.platform.eventing.application;

import com.rhn.platform.eventing.api.DomainEventEnvelope;
import com.rhn.platform.eventing.api.DomainEventPublisher;
import com.rhn.platform.eventing.domain.OutboxEvent;
import com.rhn.platform.eventing.infrastructure.OutboxEventRepository;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Map;

@Service
public class TransactionalDomainEventPublisher implements DomainEventPublisher {
    private static final String SOURCE = "rhn-application";
    private static final int SCHEMA_VERSION = 1;

    private final OutboxEventRepository outboxRepository;
    private final ApplicationEventPublisher applicationEventPublisher;
    private final ExecutionContextProvider executionContextProvider;
    private final JsonCodec jsonCodec;

    public TransactionalDomainEventPublisher(OutboxEventRepository outboxRepository,
                                             ApplicationEventPublisher applicationEventPublisher,
                                             ExecutionContextProvider executionContextProvider,
                                             JsonCodec jsonCodec) {
        this.outboxRepository = outboxRepository;
        this.applicationEventPublisher = applicationEventPublisher;
        this.executionContextProvider = executionContextProvider;
        this.jsonCodec = jsonCodec;
    }

    @Override
    public DomainEventEnvelope publish(Long tenantId, Long organizationId, String eventType, int eventVersion,
                                       String aggregateType, Long aggregateId, long aggregateVersion,
                                       Long subjectId, Instant occurredAt, Map<String, Object> payload) {
        ExecutionContext context = executionContextProvider.requireCurrent();
        DomainEventEnvelope event = new DomainEventEnvelope(com.rhn.shared.id.GlobalIds.next(), tenantId, organizationId,
                eventType, eventVersion, aggregateType, aggregateId, aggregateVersion, subjectId,
                occurredAt, Instant.now(), context.actor(), SOURCE,
                context.correlationId(), null, Map.copyOf(payload), SCHEMA_VERSION);
        outboxRepository.save(new OutboxEvent(event, jsonCodec.write(event.payload())));
        try {
            applicationEventPublisher.publishEvent(event);
        } catch (RuntimeException ignored) {
            // The durable Outbox remains PENDING and the dispatcher retries after the business transaction commits.
        }
        return event;
    }
}
