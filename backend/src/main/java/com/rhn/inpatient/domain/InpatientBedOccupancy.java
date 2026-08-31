package com.rhn.inpatient.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "inpatient_bed_occupancies")
public class InpatientBedOccupancy {
    @Id private Long id;
    @Version @Column(nullable = false) private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "bed_location_id", nullable = false) private Long bedLocationId;
    @Column(name = "episode_id", nullable = false) private Long episodeId;
    @Column(name = "encounter_id", nullable = false) private Long encounterId;
    @Column(name = "resident_id", nullable = false) private Long residentId;
    @Column(name = "started_at", nullable = false) private Instant startedAt;

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
