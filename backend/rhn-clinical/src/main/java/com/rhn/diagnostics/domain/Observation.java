package com.rhn.diagnostics.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "RHN_VIS_OBS")
public class Observation {
    @Id @Column(name = "ID_OBS") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_PAT", nullable = false) private Long residentId;
    @Column(name = "ID_ENC") private Long encounterId;
    @Column(name = "ID_ORG", nullable = false) private Long organizationId;
    @Column(name = "ID_DEPT", nullable = false) private Long departmentId;
    @Column(name = "CODE_SYSTEM_URI", nullable = false) private String codeSystemUri;
    @Column(name = "CD_CODE_RELEASE") private String codeRelease;
    @Column(name = "CD_OBS", nullable = false) private String observationCode;
    @Column(name = "NA_OBS", nullable = false) private String observationName;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "SD_VAL_TYPE", nullable = false) private String valueType;
    @Column(name = "DT_EFF", nullable = false) private Instant effectiveAt;
    @Column(name = "VALUE_STRING") private String valueString;
    @Column(name = "CD_VAL_NUMBER", precision = 28, scale = 8) private BigDecimal valueNumber;
    @Column(name = "FG_VAL_BOOLEAN") private Boolean valueBoolean;
    @Column(name = "CD_VAL") private String valueCode;
    @Column(name = "DT_VAL_DTTM") private Instant valueDateTime;
    @Column(name = "CD_UNIT") private String unitCode;
    @Column(name = "REF_RANGE_LOW", precision = 28, scale = 8) private BigDecimal referenceRangeLow;
    @Column(name = "REF_RANGE_HIGH", precision = 28, scale = 8) private BigDecimal referenceRangeHigh;
    @Column(name = "CD_INTERP") private String interpretationCode;
    @Column(name = "CD_PRFRMR") private String performerCode;
    @Column(name = "NA_PRFRMR") private String performerName;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;

    protected Observation() {}

    public Observation(Long tenantId, Long residentId, Long encounterId,
                       Long organizationId, Long departmentId,
                       String codeSystemUri,
                       String codeRelease, String observationCode, String observationName,
                       String status, String valueType, Instant effectiveAt, String valueString,
                       BigDecimal valueNumber, Boolean valueBoolean, String valueCode,
                       Instant valueDateTime, String unitCode, BigDecimal referenceRangeLow,
                       BigDecimal referenceRangeHigh, String interpretationCode,
                       String performerCode, String performerName) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.residentId = residentId;
        this.encounterId = encounterId;
        this.organizationId = organizationId; this.departmentId = departmentId;
        this.codeSystemUri = codeSystemUri; this.codeRelease = codeRelease;
        this.observationCode = observationCode; this.observationName = observationName; this.status = status;
        this.valueType = valueType; this.effectiveAt = effectiveAt; this.valueString = valueString;
        this.valueNumber = valueNumber; this.valueBoolean = valueBoolean; this.valueCode = valueCode;
        this.valueDateTime = valueDateTime; this.unitCode = unitCode; this.referenceRangeLow = referenceRangeLow;
        this.referenceRangeHigh = referenceRangeHigh; this.interpretationCode = interpretationCode;
        this.performerCode = performerCode; this.performerName = performerName; this.createdAt = Instant.now();
    }

    public Observation(Long tenantId, Long residentId, Long encounterId, String codeSystemUri,
                       String codeRelease, String observationCode, String observationName,
                       String status, String valueType, Instant effectiveAt, String valueString,
                       BigDecimal valueNumber, Boolean valueBoolean, String valueCode,
                       Instant valueDateTime, String unitCode, BigDecimal referenceRangeLow,
                       BigDecimal referenceRangeHigh, String interpretationCode,
                       String performerCode, String performerName) {
        this(tenantId, residentId, encounterId, 1L, 1L, codeSystemUri, codeRelease, observationCode,
                observationName, status, valueType, effectiveAt, valueString, valueNumber, valueBoolean,
                valueCode, valueDateTime, unitCode, referenceRangeLow, referenceRangeHigh, interpretationCode,
                performerCode, performerName);
    }

    public Long id() { return id; } public Long tenantId() { return tenantId; }
    public Long residentId() { return residentId; } public Long encounterId() { return encounterId; }
    public Long organizationId() { return organizationId; } public Long departmentId() { return departmentId; }
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
