package com.rhn.outpatient.encounter;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "encounter_diagnoses")
class EncounterDiagnosis {
    enum DiagnosisType { PRIMARY, SECONDARY }

    @Id
    private Long id;
    @Column(name = "tenant_id", nullable = false)
    private Long tenantId;
    @Column(name = "encounter_id", nullable = false)
    private Long encounterId;
    @Column(nullable = false)
    private String code;
    @Column(nullable = false)
    private String display;
    @Enumerated(EnumType.STRING)
    @Column(name = "diagnosis_type", nullable = false)
    private DiagnosisType diagnosisType;
    @Column(name = "recorded_at", nullable = false)
    private Instant recordedAt;

    protected EncounterDiagnosis() {
    }

    EncounterDiagnosis(Long tenantId, Long encounterId, String code, String display, DiagnosisType diagnosisType) {
        this.id = com.rhn.shared.id.GlobalIds.next();
        this.tenantId = tenantId;
        this.encounterId = encounterId;
        this.code = code;
        this.display = display;
        this.diagnosisType = diagnosisType;
        this.recordedAt = Instant.now();
    }

    String code() { return code; }
    String display() { return display; }
    DiagnosisType diagnosisType() { return diagnosisType; }
}

