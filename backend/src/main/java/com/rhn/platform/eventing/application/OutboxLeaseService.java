package com.rhn.platform.eventing.application;

import com.rhn.platform.eventing.domain.OutboxEvent;
import com.rhn.platform.eventing.infrastructure.OutboxEventRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

@Service
class OutboxLeaseService {
    private static final Duration LEASE = Duration.ofSeconds(30);
    private final OutboxEventRepository repository;

    OutboxLeaseService(OutboxEventRepository repository) {
        this.repository = repository;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public List<Long> claim(String workerId) {
        Instant now = Instant.now();
        List<OutboxEvent> events = repository.lockDispatchable(now, PageRequest.of(0, 50));
        events.forEach(event -> event.claim(workerId, now, LEASE));
        return events.stream().map(OutboxEvent::eventId).toList();
    }
}
