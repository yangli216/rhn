package com.rhn.platform.eventing.domain;

import com.rhn.platform.eventing.api.DomainEventEnvelope;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.time.Duration;
import com.rhn.shared.json.JsonCodec;

@Entity
@Table(name = "outbox_events")
public class OutboxEvent {
    @Id
    @Column(name = "event_id")
    private Long eventId;
    @Column(name = "tenant_id", nullable = false)
    private Long tenantId;
    @Column(name = "organization_id")
    private Long organizationId;
    @Column(name = "event_type", nullable = false)
    private String eventType;
    @Column(name = "event_version", nullable = false)
    private int eventVersion;
    @Column(name = "aggregate_type", nullable = false)
    private String aggregateType;
    @Column(name = "aggregate_id", nullable = false)
    private Long aggregateId;
    @Column(name = "aggregate_version", nullable = false)
    private long aggregateVersion;
    @Column(name = "subject_id")
    private Long subjectId;
    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;
    @Column(name = "recorded_at", nullable = false)
    private Instant recordedAt;
    @Column(nullable = false)
    private String actor;
    @Column(nullable = false)
    private String source;
    @Column(name = "correlation_id", nullable = false)
    private String correlationId;
    @Column(name = "causation_id")
    private Long causationId;
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR)
    @Column(name = "payload_json", nullable = false)
    private String payloadJson;
    @Column(name = "schema_version", nullable = false)
    private int schemaVersion;
    @Column(name = "publication_status", nullable = false)
    private String publicationStatus;
    @Column(name = "published_at")
    private Instant publishedAt;
    @Column(name = "attempt_count", nullable = false)
    private int attemptCount;
    @Column(name = "last_error")
    private String lastError;
    @Column(name = "next_attempt_at", nullable = false)
    private Instant nextAttemptAt;
    @Column(name = "claimed_by")
    private String claimedBy;
    @Column(name = "claimed_until")
    private Instant claimedUntil;

    protected OutboxEvent() {
    }

    public OutboxEvent(DomainEventEnvelope event, String payloadJson) {
        this.eventId = event.eventId();
        this.tenantId = event.tenantId();
        this.organizationId = event.organizationId();
        this.eventType = event.eventType();
        this.eventVersion = event.eventVersion();
        this.aggregateType = event.aggregateType();
        this.aggregateId = event.aggregateId();
        this.aggregateVersion = event.aggregateVersion();
        this.subjectId = event.subjectId();
        this.occurredAt = event.occurredAt();
        this.recordedAt = event.recordedAt();
        this.actor = event.actor();
        this.source = event.source();
        this.correlationId = event.correlationId();
        this.causationId = event.causationId();
        this.payloadJson = payloadJson;
        this.schemaVersion = event.schemaVersion();
        this.publicationStatus = "PENDING";
        this.attemptCount = 0;
        this.nextAttemptAt = event.recordedAt();
    }

    public Long eventId() { return eventId; }
    public Long aggregateId() { return aggregateId; }
    public String eventType() { return eventType; }
    public int eventVersion() { return eventVersion; }
    public String publicationStatus() { return publicationStatus; }
    public String correlationId() { return correlationId; }
    public String payloadJson() { return payloadJson; }
    public Instant nextAttemptAt() { return nextAttemptAt; }
    public String claimedBy() { return claimedBy; }

    public DomainEventEnvelope envelope(JsonCodec jsonCodec) {
        return new DomainEventEnvelope(eventId, tenantId, organizationId, eventType, eventVersion, aggregateType,
                aggregateId, aggregateVersion, subjectId, occurredAt, recordedAt, actor, source, correlationId,
                causationId, jsonCodec.readObject(payloadJson), schemaVersion);
    }

    public void claim(String worker, Instant now, Duration lease) {
        attemptCount++;
        claimedBy = worker;
        claimedUntil = now.plus(lease);
    }

    public void markPublished() {
        publicationStatus = "PUBLISHED";
        publishedAt = Instant.now();
        claimedBy = null;
        claimedUntil = null;
        lastError = null;
    }

    public void markFailed(RuntimeException error) {
        lastError = error.getMessage() == null ? error.getClass().getSimpleName()
                : error.getMessage().substring(0, Math.min(1000, error.getMessage().length()));
        claimedBy = null;
        claimedUntil = null;
        if (attemptCount >= 10) {
            publicationStatus = "FAILED";
            nextAttemptAt = Instant.now();
        } else {
            publicationStatus = "PENDING";
            long delaySeconds = Math.min(300, 1L << Math.min(attemptCount, 8));
            nextAttemptAt = Instant.now().plusSeconds(delaySeconds);
        }
    }
}
