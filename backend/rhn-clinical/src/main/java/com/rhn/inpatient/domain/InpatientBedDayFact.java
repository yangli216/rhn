package com.rhn.inpatient.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "RHN_VIS_INP_BED_DAY_FACT")
public class InpatientBedDayFact {
    @Id @Column(name = "ID_INP_BED_DAY_FACT") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_CARE_EPISODE", nullable = false) private Long episodeId;
    @Column(name = "ID_ENC", nullable = false) private Long encounterId;
    @Column(name = "ID_ENC_LOC_HIST", nullable = false) private Long locationHistoryId;
    @Column(name = "ID_BED_LOC", nullable = false) private Long bedLocationId;
    @Column(name = "DA_BUSINESS", nullable = false) private LocalDate businessDate;
    @Column(name = "CD_COMMAND", nullable = false) private String commandCode;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED", nullable = false) private Long createdBy;

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
