package com.rhn.platform.eventing.application;

import com.rhn.platform.eventing.domain.OutboxEvent;
import com.rhn.platform.eventing.infrastructure.OutboxEventRepository;
import com.rhn.shared.json.JsonCodec;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.lang.management.ManagementFactory;
import java.time.Instant;
import java.util.List;

@Service
@ConditionalOnProperty(prefix = "rhn.eventing.outbox", name = "enabled", havingValue = "true", matchIfMissing = true)
public class OutboxDispatcher {
    private final OutboxEventRepository repository;
    private final ApplicationEventPublisher publisher;
    private final JsonCodec jsonCodec;
    private final String workerId = ManagementFactory.getRuntimeMXBean().getName();

    public OutboxDispatcher(OutboxEventRepository repository, ApplicationEventPublisher publisher, JsonCodec jsonCodec) {
        this.repository = repository;
        this.publisher = publisher;
        this.jsonCodec = jsonCodec;
    }

    @Scheduled(fixedDelayString = "${rhn.eventing.outbox.poll-interval-ms:1000}")
    @Transactional
    public void dispatchPending() {
        List<OutboxEvent> events = repository
                .findTop50ByPublicationStatusAndNextAttemptAtLessThanEqualOrderByRecordedAtAsc("PENDING", Instant.now());
        for (OutboxEvent event : events) {
            event.markAttempt(workerId);
            try {
                publisher.publishEvent(event.envelope(jsonCodec));
                event.markPublished();
            } catch (RuntimeException error) {
                event.markFailed(error);
            }
        }
    }
}
