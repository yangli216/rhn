package com.rhn.inpatient.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "RHN_VIS_INP_EVT")
public class InpatientEvent {
    @Id @Column(name = "ID_INP_EVT") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_CARE_EPISODE") private Long episodeId;
    @Column(name = "ID_ENC") private Long encounterId;
    @Column(name = "SD_EVT_TYPE", nullable = false) private String eventType;
    @Column(name = "SD_STATUS_FROM") private String statusFrom;
    @Column(name = "SD_STATUS_TO", nullable = false) private String statusTo;
    @Column(name = "ID_SVC_LOC_SRC") private Long sourceLocationId;
    @Column(name = "ID_SVC_LOC_TARGET") private Long targetLocationId;
    @Column(name = "CD_COMMAND", nullable = false) private String commandCode;
    @Column(name = "DES_REASON") private String reason;
    @Column(name = "ID_ACTOR", nullable = false) private Long actorId;
    @Column(name = "DT_OCCRD", nullable = false) private Instant occurredAt;

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
