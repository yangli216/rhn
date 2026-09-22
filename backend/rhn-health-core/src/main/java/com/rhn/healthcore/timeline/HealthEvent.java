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
@Table(name = "RHN_VIS_HEALTH_EVT")
class HealthEvent {
    @Id
    @Column(name = "ID_HEALTH_EVT") private Long id;
    @Column(name = "ID_TNT", nullable = false)
    private Long tenantId;
    @Column(name = "ID_PAT", nullable = false)
    private Long residentId;
    @Column(name = "ID_ENC")
    private Long encounterId;
    @Column(name = "SD_EVT_TYPE", nullable = false)
    private String eventType;
    @Column(name = "DES_SUM", nullable = false)
    private String summary;
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR)
    @Column(name = "JSON_PAYLOAD", nullable = false)
    private String payloadJson;
    @Column(name = "DT_OCCRD", nullable = false)
    private Instant occurredAt;
    @Column(name = "DT_RECDD", nullable = false)
    private Instant recordedAt;
    @Column(name = "ID_USER_RECDD", nullable = false)
    private String recordedBy;
    @Column(name = "ID_SRC_EVT")
    private Long sourceEventId;
    @Column(name = "SN_EVT_VER")
    private Integer eventVersion;
    @Column(name = "SOURCE") private String source;
    @Column(name = "ID_CORR")
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
