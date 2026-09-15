package com.rhn.inpatient.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "RHN_VIS_INP_OBS")
public class InpatientObservation {
    @Id @Column(name = "ID_INP_OBS") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_INP_OBS_GRP", nullable = false) private Long observationGroupId;
    @Column(name = "CD_OBS", nullable = false) private String observationCode;
    @Column(name = "DT_OBSERVED", nullable = false) private Instant observedAt;
    @Column(name = "CD_VAL_NUMBER", nullable = false) private BigDecimal valueNumber;
    @Column(name = "CD_UNIT", nullable = false) private String unitCode;
    @Column(name = "CD_BODY_SITE") private String bodySiteCode;

    protected InpatientObservation() {
    }

    public InpatientObservation(Long tenantId, Long observationGroupId, String observationCode,
                                Instant observedAt, BigDecimal valueNumber, String unitCode,
                                String bodySiteCode) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.observationGroupId = observationGroupId;
        this.observationCode = observationCode;
        this.observedAt = observedAt;
        this.valueNumber = valueNumber;
        this.unitCode = unitCode;
        this.bodySiteCode = bodySiteCode;
    }

    public Long id() { return id; }
    public Long observationGroupId() { return observationGroupId; }
    public String observationCode() { return observationCode; }
    public Instant observedAt() { return observedAt; }
    public BigDecimal valueNumber() { return valueNumber; }
    public String unitCode() { return unitCode; }
    public String bodySiteCode() { return bodySiteCode; }
}
