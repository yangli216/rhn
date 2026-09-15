package com.rhn.queueing.application;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.rhn.platform.eventing.api.DomainEventEnvelope;
import com.rhn.platform.realtime.api.RealtimeEvent;
import com.rhn.platform.realtime.api.RealtimePublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.time.Duration;
import java.util.Map;

@Service
public class QueueingRealtimeBridge {
    private final RealtimePublisher connections;
    private final Cache<Long, Boolean> delivered = Caffeine.newBuilder()
            .expireAfterWrite(Duration.ofHours(1))
            .maximumSize(100_000)
            .build();

    public QueueingRealtimeBridge(RealtimePublisher connections) {
        this.connections = connections;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void on(DomainEventEnvelope event) {
        if (!event.eventType().startsWith("QUEUE_TICKET_")
                || delivered.asMap().putIfAbsent(event.eventId(), Boolean.TRUE) != null) return;
        Map<String, Object> payload = event.payload();
        String scene = String.valueOf(payload.get("scene"));
        Long departmentId = number(payload.get("departmentId"));
        Long queueId = number(payload.get("queueId"));
        connections.publish(event.tenantId(), new RealtimeEvent("queue:" + event.eventId(), event.eventType(),
                event.occurredAt(), "INFO", event.organizationId(), departmentId, null,
                "QueueTicket", event.aggregateId(), route(scene), Map.of(
                        "queueId", queueId,
                        "ticketCode", String.valueOf(payload.get("ticketCode")),
                        "status", String.valueOf(payload.get("status")))), authority(scene));
    }

    private Long number(Object value) {
        return value instanceof Number number ? number.longValue() : Long.valueOf(String.valueOf(value));
    }

    private String route(String scene) {
        return switch (scene) {
            case "PHARMACY" -> "/pharmacy";
            case "LAB_COLLECTION", "EXAMINATION" -> "/diagnostics";
            default -> "/outpatient/reception";
        };
    }

    private String authority(String scene) {
        return switch (scene) {
            case "PHARMACY" -> "PHARMACY.ACCESS";
            case "LAB_COLLECTION", "EXAMINATION" -> "DIAGNOSTICS.ACCESS";
            default -> "OUTPATIENT_RECEPTION.ACCESS";
        };
    }
}
