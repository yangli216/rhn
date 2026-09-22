package com.rhn.inpatient.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "RHN_VIS_INP_CHART_EVT")
public class InpatientChartEvent {
    @Id @Column(name = "ID_INP_CHART_EVT") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_CARE_EPISODE", nullable = false) private Long episodeId;
    @Column(name = "ID_ENC", nullable = false) private Long encounterId;
    @Column(name = "SD_EVT_TYPE", nullable = false) private String eventType;
    @Column(name = "ID_SVC_LOC_SRC") private Long sourceLocationId;
    @Column(name = "NA_SRC_LOC") private String sourceLocationName;
    @Column(name = "ID_SVC_LOC_TARGET") private Long targetLocationId;
    @Column(name = "NA_TARGET_LOC") private String targetLocationName;
    @Column(name = "CD_COMMAND", nullable = false) private String commandCode;
    @Column(name = "DES_DISPLAY", nullable = false) private String displayText;
    @Column(name = "DES_NOTE") private String note;
    @Column(name = "DT_OCCRD", nullable = false) private Instant occurredAt;
    @Column(name = "ID_USER_RECDD", nullable = false) private Long recordedBy;
    @Column(name = "DT_RECDD", nullable = false) private Instant recordedAt;

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
