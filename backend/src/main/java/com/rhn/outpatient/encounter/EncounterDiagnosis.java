package com.rhn.outpatient.encounter;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "encounter_diagnoses")
class EncounterDiagnosis {
    enum DiagnosisType { PRIMARY, SECONDARY }

    @Id
    private Long id;
    @Version
    private long revision;
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
    @Column(name = "business_version_no", nullable = false)
    private int businessVersionNo;
    @Column(name = "verification_status", nullable = false)
    private String verificationStatus;
    @Column(name = "diagnosis_status", nullable = false)
    private String diagnosisStatus;
    @Column(name = "clinical_note")
    private String clinicalNote;
    @Column(name = "updated_at")
    private Instant updatedAt;
    @Column(name = "updated_by")
    private Long updatedBy;

    protected EncounterDiagnosis() {
    }

    EncounterDiagnosis(Long tenantId, Long encounterId, String code, String display, DiagnosisType diagnosisType,
                       Long updatedBy) {
        this.id = com.rhn.shared.id.GlobalIds.next();
        this.tenantId = tenantId;
        this.encounterId = encounterId;
        this.code = code;
        this.display = display;
        this.diagnosisType = diagnosisType;
        this.recordedAt = Instant.now();
        this.businessVersionNo = 1;
        this.verificationStatus = "CONFIRMED";
        this.diagnosisStatus = "ACTIVE";
        this.updatedAt = recordedAt;
        this.updatedBy = updatedBy;
    }

    void revise(String display, DiagnosisType type, Long actor) {
        this.display = display;
        this.diagnosisType = type;
        this.verificationStatus = "CONFIRMED";
        this.diagnosisStatus = "ACTIVE";
        this.businessVersionNo++;
        this.updatedAt = Instant.now();
        this.updatedBy = actor;
    }

    void exclude(Long actor) {
        this.diagnosisStatus = "EXCLUDED";
        this.businessVersionNo++;
        this.updatedAt = Instant.now();
        this.updatedBy = actor;
    }

    Long id() { return id; }
    Long tenantId() { return tenantId; }
    Long encounterId() { return encounterId; }
    String code() { return code; }
    String display() { return display; }
    DiagnosisType diagnosisType() { return diagnosisType; }
    int businessVersionNo() { return businessVersionNo; }
    String verificationStatus() { return verificationStatus; }
    String diagnosisStatus() { return diagnosisStatus; }
    String clinicalNote() { return clinicalNote; }
}
