package com.rhn.inpatient.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "inpatient_bed_day_facts")
public class InpatientBedDayFact {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "episode_id", nullable = false) private Long episodeId;
    @Column(name = "encounter_id", nullable = false) private Long encounterId;
    @Column(name = "location_history_id", nullable = false) private Long locationHistoryId;
    @Column(name = "bed_location_id", nullable = false) private Long bedLocationId;
    @Column(name = "business_date", nullable = false) private LocalDate businessDate;
    @Column(name = "command_code", nullable = false) private String commandCode;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "created_by", nullable = false) private Long createdBy;

    protected InpatientBedDayFact() {
    }

    public InpatientBedDayFact(Long tenantId, Long episodeId, Long encounterId,
                               Long locationHistoryId, Long bedLocationId, LocalDate businessDate,
                               String commandCode, Long actorId) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.episodeId = episodeId;
        this.encounterId = encounterId;
        this.locationHistoryId = locationHistoryId;
        this.bedLocationId = bedLocationId;
        this.businessDate = businessDate;
        this.commandCode = commandCode;
        this.createdAt = Instant.now();
        this.createdBy = actorId;
    }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public Long episodeId() { return episodeId; }
    public Long encounterId() { return encounterId; }
    public Long locationHistoryId() { return locationHistoryId; }
    public Long bedLocationId() { return bedLocationId; }
    public LocalDate businessDate() { return businessDate; }
    public String commandCode() { return commandCode; }
    public Instant createdAt() { return createdAt; }
    public Long createdBy() { return createdBy; }
}
