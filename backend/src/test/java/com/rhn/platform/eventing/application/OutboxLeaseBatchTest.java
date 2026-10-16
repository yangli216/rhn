package com.rhn.platform.eventing.application;

import com.rhn.RhnApplication;
import com.rhn.platform.eventing.api.DomainEventEnvelope;
import com.rhn.platform.eventing.domain.OutboxEvent;
import com.rhn.platform.eventing.infrastructure.OutboxEventRepository;
import com.rhn.shared.id.GlobalIds;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(classes = RhnApplication.class, properties = "rhn.eventing.outbox.batch-size=2")
@ActiveProfiles("test")
class OutboxLeaseBatchTest {
    @Autowired OutboxLeaseService leases;
    @Autowired OutboxEventRepository repository;

    @Test
    void configuredBatchSizeLimitsDatabaseClaimsAndLeavesRemainingEventsAvailable() {
        var first = event(Instant.parse("2000-01-01T00:00:00Z"));
        var second = event(Instant.parse("2000-01-01T00:00:01Z"));
        var third = event(Instant.parse("2000-01-01T00:00:02Z"));
        repository.saveAllAndFlush(List.of(first, second, third));

        assertThat(leases.claim("worker-a")).containsExactly(first.eventId(), second.eventId());
        assertThat(repository.findById(first.eventId()).orElseThrow().claimedBy()).isEqualTo("worker-a");
        assertThat(repository.findById(second.eventId()).orElseThrow().claimedBy()).isEqualTo("worker-a");
        assertThat(repository.findById(third.eventId()).orElseThrow().claimedBy()).isNull();

        assertThat(leases.claim("worker-b")).containsExactly(third.eventId());
        assertThat(repository.findById(third.eventId()).orElseThrow().claimedBy()).isEqualTo("worker-b");
        assertThat(leases.claim("worker-c")).isEmpty();
    }

    private OutboxEvent event(Instant recordedAt) {
        Long id = GlobalIds.next();
        return new OutboxEvent(new DomainEventEnvelope(id, 362387869790209L, 362387869790211L,
                "TEST", 1, "Resident", id, 0, id, recordedAt, recordedAt,
                "test", "test-suite", "batch-test", null, Map.of(), 1), "{}");
    }
}
