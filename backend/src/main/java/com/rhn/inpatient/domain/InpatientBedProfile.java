package com.rhn.inpatient.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "inpatient_bed_profiles")
public class InpatientBedProfile {
    @Id @Column(name = "bed_location_id") private Long bedLocationId;
    @Version @Column(nullable = false) private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "bed_type", nullable = false) private String bedType;
    @Column(name = "gender_restriction", nullable = false) private String genderRestriction;
    @Column(name = "operational_status", nullable = false) private String operationalStatus;
    @Column(name = "nursing_group_code") private String nursingGroupCode;
    @Column(name = "responsible_nurse_id") private Long responsibleNurseId;
    @Column(name = "daily_bed_rate") private BigDecimal dailyBedRate;
    @Column(name = "charge_catalog_item_id") private Long chargeCatalogItemId;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "updated_by", nullable = false) private Long updatedBy;

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
