package com.rhn.platform.eventing.application;

import com.rhn.platform.eventing.api.DomainEventEnvelope;
import com.rhn.platform.eventing.api.IdempotentDomainEventConsumer;
import com.rhn.platform.eventing.domain.EventConsumption;
import com.rhn.platform.eventing.infrastructure.EventConsumptionRepository;
import com.rhn.platform.maintenance.api.MaintenanceWriteGuard;
import com.rhn.platform.maintenance.api.MaintenanceResourceRetirement;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class IdempotentEventConsumer implements IdempotentDomainEventConsumer {
    private final EventConsumptionRepository repository;
    private final MaintenanceWriteGuard writes;
    private final MaintenanceResourceRetirement retired;

    public IdempotentEventConsumer(EventConsumptionRepository repository, MaintenanceWriteGuard writes,
                                  MaintenanceResourceRetirement retired) {
        this.repository = repository;
        this.writes = writes; this.retired = retired;
    }

    @Override
    @Transactional
    public boolean consume(String consumerName, DomainEventEnvelope event, Runnable action) {
        if (retired.retired(event.tenantId(), event.aggregateId())) return false;
        writes.enter(event.tenantId());
        if (retired.retired(event.tenantId(), event.aggregateId())) return false;
        if (repository.existsByConsumerNameAndEventId(consumerName, event.eventId())) return false;
        action.run();
        repository.save(new EventConsumption(event.tenantId(), consumerName, event.eventId()));
        return true;
    }
}
