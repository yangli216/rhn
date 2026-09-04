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
@Table(name = "RHN_INT_OUTBOX_EVT")
public class OutboxEvent {
    @Id
    @Column(name = "ID_EVT")
    private Long eventId;
    @Column(name = "ID_TNT", nullable = false)
    private Long tenantId;
    @Column(name = "ID_ORG")
    private Long organizationId;
    @Column(name = "SD_EVT_TYPE", nullable = false)
    private String eventType;
    @Column(name = "SN_EVT_VER", nullable = false)
    private int eventVersion;
    @Column(name = "SD_AGGREGATE_TYPE", nullable = false)
    private String aggregateType;
    @Column(name = "ID_AGGREGATE", nullable = false)
    private Long aggregateId;
    @Column(name = "SN_AGGREGATE_VER", nullable = false)
    private long aggregateVersion;
    @Column(name = "ID_SUBJECT")
    private Long subjectId;
    @Column(name = "DT_OCCURRED", nullable = false)
    private Instant occurredAt;
    @Column(name = "DT_RECORDED", nullable = false)
    private Instant recordedAt;
    @Column(name = "CD_ACTOR", nullable = false)
    private String actor;
    @Column(name = "SOURCE", nullable = false)
    private String source;
    @Column(name = "ID_CORRELATION", nullable = false)
    private String correlationId;
    @Column(name = "ID_CAUSATION")
    private Long causationId;
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR)
    @Column(name = "JSON_PAYLOAD", nullable = false)
    private String payloadJson;
    @Column(name = "SN_SCHEMA_VER", nullable = false)
    private int schemaVersion;
    @Column(name = "SD_PUBLICATION_STATUS", nullable = false)
    private String publicationStatus;
    @Column(name = "DT_PUBLISD")
    private Instant publishedAt;
    @Column(name = "QTY_ATTEMPT", nullable = false)
    private int attemptCount;
    @Column(name = "DES_LAST_ERROR")
    private String lastError;
    @Column(name = "DT_NEXT_ATTEMPT", nullable = false)
    private Instant nextAttemptAt;
    @Column(name = "ID_USER_CLAIMED")
    private String claimedBy;
    @Column(name = "DT_CLAIMED_UNTIL")
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
