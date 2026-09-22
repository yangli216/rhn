package com.rhn.inpatient.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "RHN_VIS_INP_BED_PROF")
public class InpatientBedProfile {
    @Id @Column(name = "ID_SVC_LOC_BED") private Long bedLocationId;
    @Version @Column(name = "REVISION", nullable = false) private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "SD_BED_TYPE", nullable = false) private String bedType;
    @Column(name = "SD_GENDER_RSTRCT", nullable = false) private String genderRestriction;
    @Column(name = "SD_OPERAT_STATUS", nullable = false) private String operationalStatus;
    @Column(name = "CD_NURS_GRP") private String nursingGroupCode;
    @Column(name = "ID_RSPNSBL_NURSE") private Long responsibleNurseId;
    @Column(name = "PRICE_BED_DAY") private BigDecimal dailyBedRate;
    @Column(name = "ID_CATALOG_ITEM_CHARGE") private Long chargeCatalogItemId;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED", nullable = false) private Long updatedBy;

    protected InpatientBedProfile() {
    }

    public InpatientBedProfile(Long bedLocationId, Long tenantId, String bedType, String genderRestriction,
                               String nursingGroupCode, BigDecimal dailyBedRate, Long actorId) {
        this.bedLocationId = bedLocationId;
        this.tenantId = tenantId;
        this.bedType = bedType;
        this.genderRestriction = genderRestriction;
        this.operationalStatus = "AVAILABLE";
        this.nursingGroupCode = nursingGroupCode;
        this.dailyBedRate = dailyBedRate;
        this.updatedAt = Instant.now();
        this.updatedBy = actorId;
    }

    public void changeStatus(String status, long expectedRevision, Long actorId) {
        if (revision != expectedRevision) throw new IllegalStateException("STALE_REVISION");
        this.operationalStatus = status;
        this.updatedAt = Instant.now();
        this.updatedBy = actorId;
    }

    public void markCleaning(Long actorId) {
        this.operationalStatus = "CLEANING";
        this.updatedAt = Instant.now();
        this.updatedBy = actorId;
    }

    public Long bedLocationId() { return bedLocationId; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public String bedType() { return bedType; }
    public String genderRestriction() { return genderRestriction; }
    public String operationalStatus() { return operationalStatus; }
    public String nursingGroupCode() { return nursingGroupCode; }
    public Long responsibleNurseId() { return responsibleNurseId; }
    public BigDecimal dailyBedRate() { return dailyBedRate; }
    public Long chargeCatalogItemId() { return chargeCatalogItemId; }
}
