package com.rhn.diagnostics.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "critical_value_alert_events")
public class CriticalValueAlertEvent {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "alert_id", nullable = false) private Long alertId;
    @Column(name = "event_type", nullable = false) private String eventType;
    @Column(name = "status_from") private String statusFrom;
    @Column(name = "status_to", nullable = false) private String statusTo;
    @Column(name = "actor_id") private Long actorId;
    @Column(name = "note_text") private String noteText;
    @Column(name = "correlation_id", nullable = false) private String correlationId;
    @Column(name = "occurred_at", nullable = false) private Instant occurredAt;

    protected CriticalValueAlertEvent() {}

    public CriticalValueAlertEvent(Long tenantId, Long alertId, String eventType, String statusFrom,
                                   String statusTo, Long actorId, String noteText,
                                   String correlationId, Instant occurredAt) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.alertId = alertId;
        this.eventType = eventType; this.statusFrom = statusFrom; this.statusTo = statusTo;
        this.actorId = actorId; this.noteText = noteText; this.correlationId = correlationId;
        this.occurredAt = occurredAt;
    }
}
