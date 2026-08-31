package com.rhn.inpatient.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "inpatient_events")
public class InpatientEvent {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "episode_id") private Long episodeId;
    @Column(name = "encounter_id") private Long encounterId;
    @Column(name = "event_type", nullable = false) private String eventType;
    @Column(name = "status_from") private String statusFrom;
    @Column(name = "status_to", nullable = false) private String statusTo;
    @Column(name = "source_location_id") private Long sourceLocationId;
    @Column(name = "target_location_id") private Long targetLocationId;
    @Column(name = "command_code", nullable = false) private String commandCode;
    @Column private String reason;
    @Column(name = "actor_id", nullable = false) private Long actorId;
    @Column(name = "occurred_at", nullable = false) private Instant occurredAt;

    protected InpatientEvent() {
    }

    public InpatientEvent(Long tenantId, Long episodeId, Long encounterId, String eventType,
                          String statusFrom, String statusTo, Long sourceLocationId,
                          Long targetLocationId, String commandCode, String reason, Long actorId) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.episodeId = episodeId;
        this.encounterId = encounterId;
        this.eventType = eventType;
        this.statusFrom = statusFrom;
        this.statusTo = statusTo;
        this.sourceLocationId = sourceLocationId;
        this.targetLocationId = targetLocationId;
        this.commandCode = commandCode;
        this.reason = reason;
        this.actorId = actorId;
        this.occurredAt = Instant.now();
    }

    public Long episodeId() { return episodeId; }
    public Long encounterId() { return encounterId; }
    public String commandCode() { return commandCode; }
}
