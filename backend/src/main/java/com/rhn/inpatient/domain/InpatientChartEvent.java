package com.rhn.inpatient.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "inpatient_chart_events")
public class InpatientChartEvent {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "episode_id", nullable = false) private Long episodeId;
    @Column(name = "encounter_id", nullable = false) private Long encounterId;
    @Column(name = "event_type", nullable = false) private String eventType;
    @Column(name = "source_location_id") private Long sourceLocationId;
    @Column(name = "source_location_name") private String sourceLocationName;
    @Column(name = "target_location_id") private Long targetLocationId;
    @Column(name = "target_location_name") private String targetLocationName;
    @Column(name = "command_code", nullable = false) private String commandCode;
    @Column(name = "display_text", nullable = false) private String displayText;
    @Column private String note;
    @Column(name = "occurred_at", nullable = false) private Instant occurredAt;
    @Column(name = "recorded_by", nullable = false) private Long recordedBy;
    @Column(name = "recorded_at", nullable = false) private Instant recordedAt;

    protected InpatientChartEvent() {
    }

    public InpatientChartEvent(Long tenantId, Long episodeId, Long encounterId, String eventType,
                               Long sourceLocationId, String sourceLocationName,
                               Long targetLocationId, String targetLocationName,
                               String commandCode, String displayText, String note,
                               Instant occurredAt, Long recordedBy) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.episodeId = episodeId;
        this.encounterId = encounterId;
        this.eventType = eventType;
        this.sourceLocationId = sourceLocationId;
        this.sourceLocationName = sourceLocationName;
        this.targetLocationId = targetLocationId;
        this.targetLocationName = targetLocationName;
        this.commandCode = commandCode;
        this.displayText = displayText;
        this.note = note;
        this.occurredAt = occurredAt;
        this.recordedBy = recordedBy;
        this.recordedAt = Instant.now();
    }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public Long episodeId() { return episodeId; }
    public Long encounterId() { return encounterId; }
    public String eventType() { return eventType; }
    public Long sourceLocationId() { return sourceLocationId; }
    public String sourceLocationName() { return sourceLocationName; }
    public Long targetLocationId() { return targetLocationId; }
    public String targetLocationName() { return targetLocationName; }
    public String commandCode() { return commandCode; }
    public String displayText() { return displayText; }
    public String note() { return note; }
    public Instant occurredAt() { return occurredAt; }
    public Long recordedBy() { return recordedBy; }
    public Instant recordedAt() { return recordedAt; }
}
