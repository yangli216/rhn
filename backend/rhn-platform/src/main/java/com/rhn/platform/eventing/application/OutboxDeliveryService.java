package com.rhn.platform.eventing.application;

import com.rhn.platform.eventing.domain.OutboxEvent;
import com.rhn.platform.eventing.infrastructure.OutboxEventRepository;
import com.rhn.shared.json.JsonCodec;
import com.rhn.platform.maintenance.api.MaintenanceWriteGuard;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
class OutboxDeliveryService {
    private final OutboxEventRepository repository;
    private final ApplicationEventPublisher publisher;
    private final JsonCodec jsonCodec;
    private final MaintenanceWriteGuard writes;

    OutboxDeliveryService(OutboxEventRepository repository, ApplicationEventPublisher publisher, JsonCodec jsonCodec,
                         MaintenanceWriteGuard writes) {
        this.repository = repository;
        this.publisher = publisher;
        this.jsonCodec = jsonCodec;
        this.writes = writes;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void deliver(Long eventId, String workerId) {
        Long tenant = repository.tenantOf(eventId).orElse(null);
        if (tenant == null) return;
        try {
            writes.enter(tenant); // Released after this transaction commits, including synchronous consumers.
        } catch (com.rhn.shared.api.BusinessException error) {
            if ("MAINTENANCE_WRITE_PAUSED".equals(error.code())) return;
            throw error;
        }
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
