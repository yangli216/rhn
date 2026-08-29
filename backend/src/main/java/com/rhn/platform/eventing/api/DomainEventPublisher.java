package com.rhn.platform.eventing.api;

import java.time.Instant;
import java.util.Map;

public interface DomainEventPublisher {
    DomainEventEnvelope publish(Long tenantId, Long organizationId, String eventType, int eventVersion,
                                String aggregateType, Long aggregateId, long aggregateVersion,
                                Long subjectId, Instant occurredAt, Map<String, Object> payload);
}
