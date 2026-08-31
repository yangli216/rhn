package com.rhn.inpatient.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "inpatient_observation_groups")
public class InpatientObservationGroup {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "episode_id", nullable = false) private Long episodeId;
    @Column(name = "encounter_id", nullable = false) private Long encounterId;
    @Column(name = "measured_at", nullable = false) private Instant measuredAt;
    @Column(name = "source_type", nullable = false) private String sourceType;
    @Column(name = "command_code", nullable = false) private String commandCode;
    @Column private String note;
    @Column(name = "recorded_by", nullable = false) private Long recordedBy;
    @Column(name = "recorded_at", nullable = false) private Instant recordedAt;

    protected InpatientObservationGroup() {
    }

    public InpatientObservationGroup(Long tenantId, Long episodeId, Long encounterId,
                                     Instant measuredAt, String sourceType, String commandCode,
                                     String note, Long recordedBy) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.episodeId = episodeId;
        this.encounterId = encounterId;
        this.measuredAt = measuredAt;
        this.sourceType = sourceType;
        this.commandCode = commandCode;
        this.note = note;
        this.recordedBy = recordedBy;
        this.recordedAt = Instant.now();
    }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public Long episodeId() { return episodeId; }
    public Long encounterId() { return encounterId; }
    public Instant measuredAt() { return measuredAt; }
    public String sourceType() { return sourceType; }
    public String commandCode() { return commandCode; }
    public String note() { return note; }
    public Long recordedBy() { return recordedBy; }
    public Instant recordedAt() { return recordedAt; }
}
