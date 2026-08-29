package com.rhn.healthcore.timeline;

import com.rhn.platform.eventing.api.DomainEventEnvelope;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;

@Entity
@Table(name = "health_events")
class HealthEvent {
    @Id
    private Long id;
    @Column(name = "tenant_id", nullable = false)
    private Long tenantId;
    @Column(name = "resident_id", nullable = false)
    private Long residentId;
    @Column(name = "encounter_id")
    private Long encounterId;
    @Column(name = "event_type", nullable = false)
    private String eventType;
    @Column(nullable = false)
    private String summary;
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR)
    @Column(name = "payload_json", nullable = false)
    private String payloadJson;
    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;
    @Column(name = "recorded_at", nullable = false)
    private Instant recordedAt;
    @Column(name = "recorded_by", nullable = false)
    private String recordedBy;
    @Column(name = "source_event_id")
    private Long sourceEventId;
    @Column(name = "event_version")
    private Integer eventVersion;
    private String source;
    @Column(name = "correlation_id")
    private String correlationId;

    protected HealthEvent() {
    }

    HealthEvent(DomainEventEnvelope event, String payloadJson) {
        this.id = com.rhn.shared.id.GlobalIds.next();
        this.tenantId = event.tenantId();
        this.residentId = event.subjectId();
        this.encounterId = "Encounter".equals(event.aggregateType()) ? event.aggregateId()
                : longValue(event.payload().get("encounterId"));
        this.eventType = event.eventType();
        this.summary = String.valueOf(event.payload().getOrDefault("summary", event.eventType()));
        this.payloadJson = payloadJson;
        this.occurredAt = event.occurredAt();
        this.recordedAt = event.recordedAt();
        this.recordedBy = event.actor();
        this.sourceEventId = event.eventId();
        this.eventVersion = event.eventVersion();
        this.source = event.source();
        this.correlationId = event.correlationId();
    }

    private Long longValue(Object value) {
        if (value instanceof Number number) return number.longValue();
        if (value instanceof String text && text.matches("[1-9][0-9]{0,18}")) return Long.valueOf(text);
        return null;
    }

    Long id() { return id; }
    Long encounterId() { return encounterId; }
    String eventType() { return eventType; }
    String summary() { return summary; }
    String payloadJson() { return payloadJson; }
    Instant occurredAt() { return occurredAt; }
    String recordedBy() { return recordedBy; }
    Long sourceEventId() { return sourceEventId; }
}
