package com.rhn.inpatient.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "RHN_VIS_INP_OBS_GRP")
public class InpatientObservationGroup {
    @Id @Column(name = "ID_INP_OBS_GRP") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_CARE_EPISODE", nullable = false) private Long episodeId;
    @Column(name = "ID_ENC", nullable = false) private Long encounterId;
    @Column(name = "DT_MEASD", nullable = false) private Instant measuredAt;
    @Column(name = "SD_SRC_TYPE", nullable = false) private String sourceType;
    @Column(name = "CD_COMMAND", nullable = false) private String commandCode;
    @Column(name = "DES_NOTE") private String note;
    @Column(name = "ID_USER_RECDD", nullable = false) private Long recordedBy;
    @Column(name = "DT_RECDD", nullable = false) private Instant recordedAt;

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
