package com.rhn.diagnostics.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "observations")
public class Observation {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "resident_id", nullable = false) private Long residentId;
    @Column(name = "encounter_id") private Long encounterId;
    @Column(name = "code_system_uri", nullable = false) private String codeSystemUri;
    @Column(name = "code_release") private String codeRelease;
    @Column(name = "observation_code", nullable = false) private String observationCode;
    @Column(name = "observation_name", nullable = false) private String observationName;
    @Column(nullable = false) private String status;
    @Column(name = "value_type", nullable = false) private String valueType;
    @Column(name = "effective_at", nullable = false) private Instant effectiveAt;
    @Column(name = "value_string") private String valueString;
    @Column(name = "value_number", precision = 28, scale = 8) private BigDecimal valueNumber;
    @Column(name = "value_boolean") private Boolean valueBoolean;
    @Column(name = "value_code") private String valueCode;
    @Column(name = "value_datetime") private Instant valueDateTime;
    @Column(name = "unit_code") private String unitCode;
    @Column(name = "reference_range_low", precision = 28, scale = 8) private BigDecimal referenceRangeLow;
    @Column(name = "reference_range_high", precision = 28, scale = 8) private BigDecimal referenceRangeHigh;
    @Column(name = "interpretation_code") private String interpretationCode;
    @Column(name = "performer_code") private String performerCode;
    @Column(name = "performer_name") private String performerName;
    @Column(name = "created_at", nullable = false) private Instant createdAt;

    protected Observation() {}

    public Observation(Long tenantId, Long residentId, Long encounterId, String codeSystemUri,
                       String codeRelease, String observationCode, String observationName,
                       String status, String valueType, Instant effectiveAt, String valueString,
                       BigDecimal valueNumber, Boolean valueBoolean, String valueCode,
                       Instant valueDateTime, String unitCode, BigDecimal referenceRangeLow,
                       BigDecimal referenceRangeHigh, String interpretationCode,
                       String performerCode, String performerName) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.residentId = residentId;
        this.encounterId = encounterId; this.codeSystemUri = codeSystemUri; this.codeRelease = codeRelease;
        this.observationCode = observationCode; this.observationName = observationName; this.status = status;
        this.valueType = valueType; this.effectiveAt = effectiveAt; this.valueString = valueString;
        this.valueNumber = valueNumber; this.valueBoolean = valueBoolean; this.valueCode = valueCode;
        this.valueDateTime = valueDateTime; this.unitCode = unitCode; this.referenceRangeLow = referenceRangeLow;
        this.referenceRangeHigh = referenceRangeHigh; this.interpretationCode = interpretationCode;
        this.performerCode = performerCode; this.performerName = performerName; this.createdAt = Instant.now();
    }

    public Long id() { return id; } public Long tenantId() { return tenantId; }
    public Long residentId() { return residentId; } public Long encounterId() { return encounterId; }
    public String codeSystemUri() { return codeSystemUri; }
    public String codeRelease() { return codeRelease; } public String observationCode() { return observationCode; }
    public String observationName() { return observationName; } public String status() { return status; }
    public String valueType() { return valueType; } public Instant effectiveAt() { return effectiveAt; }
    public String valueString() { return valueString; } public BigDecimal valueNumber() { return valueNumber; }
    public Boolean valueBoolean() { return valueBoolean; } public String valueCode() { return valueCode; }
    public Instant valueDateTime() { return valueDateTime; } public String unitCode() { return unitCode; }
    public BigDecimal referenceRangeLow() { return referenceRangeLow; }
    public BigDecimal referenceRangeHigh() { return referenceRangeHigh; }
    public String interpretationCode() { return interpretationCode; }
    public String performerCode() { return performerCode; } public String performerName() { return performerName; }
}
