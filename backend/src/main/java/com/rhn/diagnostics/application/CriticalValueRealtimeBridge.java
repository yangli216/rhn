package com.rhn.diagnostics.application;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.rhn.diagnostics.api.CriticalValueAlertChanged;
import com.rhn.healthcore.api.EncounterCareSettingDirectory;
import com.rhn.platform.eventing.api.DomainEventEnvelope;
import com.rhn.platform.realtime.api.RealtimeEvent;
import com.rhn.platform.realtime.application.RealtimeConnectionRegistry;
import com.rhn.shared.event.EventPayload;
import org.springframework.stereotype.Service;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.time.Duration;
import java.util.Map;

@Service
public class CriticalValueRealtimeBridge {
    private final RealtimeConnectionRegistry connections;
    private final EncounterCareSettingDirectory encounters;
    private final Cache<Long, Boolean> deliveredDomainEvents = Caffeine.newBuilder()
            .expireAfterWrite(Duration.ofHours(1))
            .maximumSize(100_000)
            .build();

    public CriticalValueRealtimeBridge(RealtimeConnectionRegistry connections,
                                       EncounterCareSettingDirectory encounters) {
        this.connections = connections;
        this.encounters = encounters;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void on(DomainEventEnvelope event) {
        if (!event.eventType().startsWith("DIAGNOSTIC_CRITICAL_VALUE_")
                || deliveredDomainEvents.asMap().putIfAbsent(event.eventId(), Boolean.TRUE) != null) return;
        EventPayload payload = EventPayload.of(event.payload());
        Long departmentId = payload.longValue("departmentId");
        Long recipientUserId = payload.longValue("recipientUserId");
        Long alertId = payload.longValue("alertId");
        Long encounterId = payload.longValue("encounterId");
        connections.publish(event.tenantId(), new RealtimeEvent("critical:" + event.eventId(), event.eventType(),
                event.occurredAt(), "CRITICAL", event.organizationId(), departmentId, recipientUserId,
                "CriticalValueAlert", alertId, route(event.tenantId(), encounterId),
                Map.of("status", String.valueOf(event.payload().get("status")))), null);
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void on(CriticalValueAlertChanged change) {
        String id = "critical-local:" + change.eventId() + ":" + change.changeType();
        connections.publish(change.tenantId(), new RealtimeEvent(id, change.changeType(), change.occurredAt(),
                "CRITICAL", change.organizationId(), change.departmentId(), change.recipientUserId(),
                "CriticalValueAlert", change.alertId(), route(change.tenantId(), change.encounterId()), Map.of()), null);
    }

    private String route(Long tenantId, Long encounterId) {
        if (encounterId == null) return "/outpatient/reception";
        return "INPATIENT".equals(encounters.require(tenantId, encounterId).encounterClass())
                ? "/inpatient" : "/outpatient/reception";
    }
}
