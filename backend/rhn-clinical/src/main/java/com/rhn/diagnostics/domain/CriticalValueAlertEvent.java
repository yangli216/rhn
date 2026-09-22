package com.rhn.diagnostics.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "RHN_VIS_CRIT_VAL_ALERT_EVT")
public class CriticalValueAlertEvent {
    @Id @Column(name = "ID_CRIT_VAL_ALERT_EVT") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_CRIT_VAL_ALERT", nullable = false) private Long alertId;
    @Column(name = "SD_EVT_TYPE", nullable = false) private String eventType;
    @Column(name = "SD_STATUS_FROM") private String statusFrom;
    @Column(name = "SD_STATUS_TO", nullable = false) private String statusTo;
    @Column(name = "ID_USER_ACTOR") private Long actorId;
    @Column(name = "DES_NOTE") private String noteText;
    @Column(name = "ID_CORR", nullable = false) private String correlationId;
    @Column(name = "DT_OCCRD", nullable = false) private Instant occurredAt;

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
