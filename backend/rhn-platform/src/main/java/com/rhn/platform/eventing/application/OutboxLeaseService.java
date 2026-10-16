package com.rhn.platform.eventing.application;

import com.rhn.platform.eventing.domain.OutboxEvent;
import com.rhn.platform.eventing.infrastructure.OutboxEventRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

@Service
class OutboxLeaseService {
    private final OutboxEventRepository repository;
    private final Duration leaseTtl;
    private final int batchSize;

    OutboxLeaseService(OutboxEventRepository repository,
                       @Value("${rhn.eventing.outbox.lease-ttl:PT30S}") Duration leaseTtl,
                       @Value("${rhn.eventing.outbox.batch-size:50}") int batchSize) {
        if (leaseTtl.isZero() || leaseTtl.isNegative()) {
            throw new IllegalArgumentException("Outbox lease TTL must be positive");
        }
        if (batchSize < 1) {
            throw new IllegalArgumentException("Outbox batch size must be positive");
        }
        this.repository = repository;
        this.leaseTtl = leaseTtl;
        this.batchSize = batchSize;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public List<Long> claim(String workerId) {
        Instant now = Instant.now();
        List<OutboxEvent> events = repository.lockDispatchable(now, PageRequest.of(0, batchSize));
        events.forEach(event -> event.claim(workerId, now, leaseTtl));
        return events.stream().map(OutboxEvent::eventId).toList();
    }
}
