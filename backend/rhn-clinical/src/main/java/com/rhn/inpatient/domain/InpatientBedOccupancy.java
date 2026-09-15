package com.rhn.inpatient.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "RHN_VIS_INP_BED_OCCUP")
public class InpatientBedOccupancy {
    @Id @Column(name = "ID_INP_BED_OCCUP") private Long id;
    @Version @Column(name = "REVISION", nullable = false) private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_BED_LOC", nullable = false) private Long bedLocationId;
    @Column(name = "ID_CARE_EPISODE", nullable = false) private Long episodeId;
    @Column(name = "ID_ENC", nullable = false) private Long encounterId;
    @Column(name = "ID_PAT", nullable = false) private Long residentId;
    @Column(name = "DT_STARTED", nullable = false) private Instant startedAt;

    protected InpatientBedOccupancy() {
    }

    public InpatientBedOccupancy(Long tenantId, Long bedLocationId, Long episodeId,
                                 Long encounterId, Long residentId) {
        this(tenantId, bedLocationId, episodeId, encounterId, residentId, Instant.now());
    }

    public InpatientBedOccupancy(Long tenantId, Long bedLocationId, Long episodeId,
                                 Long encounterId, Long residentId, Instant startedAt) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.bedLocationId = bedLocationId;
        this.episodeId = episodeId;
        this.encounterId = encounterId;
        this.residentId = residentId;
        this.startedAt = startedAt;
    }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public Long bedLocationId() { return bedLocationId; }
    public Long episodeId() { return episodeId; }
    public Long encounterId() { return encounterId; }
    public Long residentId() { return residentId; }
    public Instant startedAt() { return startedAt; }
}
