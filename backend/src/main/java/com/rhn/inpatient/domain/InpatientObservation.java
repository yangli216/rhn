package com.rhn.inpatient.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "inpatient_observations")
public class InpatientObservation {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "observation_group_id", nullable = false) private Long observationGroupId;
    @Column(name = "observation_code", nullable = false) private String observationCode;
    @Column(name = "observed_at", nullable = false) private Instant observedAt;
    @Column(name = "value_number", nullable = false) private BigDecimal valueNumber;
    @Column(name = "unit_code", nullable = false) private String unitCode;
    @Column(name = "body_site_code") private String bodySiteCode;

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
