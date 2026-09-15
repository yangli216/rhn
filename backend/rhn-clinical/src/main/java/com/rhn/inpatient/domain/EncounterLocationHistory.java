package com.rhn.inpatient.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "RHN_VIS_ENC_LOC_HIST")
public class EncounterLocationHistory {
    @Id @Column(name = "ID_ENC_LOC_HIST") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_ENC", nullable = false) private Long encounterId;
    @Column(name = "ID_SVC_LOC", nullable = false) private Long locationId;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DT_START", nullable = false) private Instant startAt;
    @Column(name = "DT_END") private Instant endAt;
    @Column(name = "DES_CHG_REASON") private String changeReason;
    @Column(name = "ID_USER_CHANGED", nullable = false) private Long changedBy;

    protected EncounterLocationHistory() {
    }

    public EncounterLocationHistory(Long tenantId, Long encounterId, Long locationId,
                                    String reason, Long actorId) {
        this(tenantId, encounterId, locationId, reason, actorId, Instant.now());
    }

    public EncounterLocationHistory(Long tenantId, Long encounterId, Long locationId,
                                    String reason, Long actorId, Instant startedAt) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.encounterId = encounterId;
        this.locationId = locationId;
        this.status = "ACTIVE";
        this.startAt = startedAt;
        this.changeReason = reason;
        this.changedBy = actorId;
    }

    public void close(String reason, Long actorId) {
        if (!"ACTIVE".equals(status)) throw new IllegalStateException("LOCATION_ALREADY_CLOSED");
        this.status = "COMPLETED";
        this.endAt = Instant.now();
        this.changeReason = reason;
        this.changedBy = actorId;
    }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public Long encounterId() { return encounterId; }
    public Long locationId() { return locationId; }
    public String status() { return status; }
    public Instant startAt() { return startAt; }
    public Instant endAt() { return endAt; }
}
