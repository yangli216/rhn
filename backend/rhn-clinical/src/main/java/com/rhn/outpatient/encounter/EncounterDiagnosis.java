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
@Table(name = "RHN_VIS_ENC_DIAG")
class EncounterDiagnosis {
    enum DiagnosisType { PRIMARY, SECONDARY }

    @Id
    @Column(name = "ID_ENC_DIAG") private Long id;
    @Version
    @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false)
    private Long tenantId;
    @Column(name = "ID_ENC", nullable = false)
    private Long encounterId;
    @Column(name = "ID_CONCEPT")
    private Long conceptId;
    @Column(name = "SD_DIAG_STAGE", nullable = false)
    private String diagnosisStage;
    @Column(name = "CD_ENC_DIAG", nullable = false)
    private String code;
    @Column(name = "NA_DISPLAY", nullable = false)
    private String display;
    @Column(name = "CD_CODE_SYS_SNAP")
    private String codeSystemCodeSnapshot;
    @Column(name = "CODE_SYSTEM_VERSION_SNAPSHOT")
    private String codeSystemVersionSnapshot;
    @Column(name = "SD_DIAG_DOMAIN", nullable = false)
    private String diagnosisDomain;
    @Column(name = "ID_DIAG_GRP")
    private String diagnosisGroupId;
    @Column(name = "SN_SORT", nullable = false)
    private int sortOrder;
    @Column(name = "JSON_MGMT_SNAP")
    private String managementSnapshotJson;
    @Enumerated(EnumType.STRING)
    @Column(name = "SD_DIAG_TYPE", nullable = false)
    private DiagnosisType diagnosisType;
    @Column(name = "DT_RECORDED", nullable = false)
    private Instant recordedAt;
    @Column(name = "CD_BUSINESS_VER_NO", nullable = false)
    private int businessVersionNo;
    @Column(name = "SD_VERIFICATION_STATUS", nullable = false)
    private String verificationStatus;
    @Column(name = "SD_DIAG_STATUS", nullable = false)
    private String diagnosisStatus;
    @Column(name = "DES_CLIN_NOTE")
    private String clinicalNote;
    @Column(name = "DT_UPDATED")
    private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED")
    private Long updatedBy;

    protected EncounterDiagnosis() {
    }

    EncounterDiagnosis(Long tenantId, Long encounterId, String code, String display, DiagnosisType diagnosisType,
                       Long updatedBy) {
        this(tenantId, encounterId, "ENCOUNTER", code, display, diagnosisType, updatedBy);
    }

    EncounterDiagnosis(Long tenantId, Long encounterId, String diagnosisStage, String code, String display,
                       DiagnosisType diagnosisType, Long updatedBy) {
        this(tenantId, encounterId, diagnosisStage, code, display, diagnosisType, "CONFIRMED", updatedBy);
    }

    EncounterDiagnosis(Long tenantId, Long encounterId, String diagnosisStage, String code, String display,
                       DiagnosisType diagnosisType, String verificationStatus, Long updatedBy) {
        this(tenantId, encounterId, diagnosisStage, null, null, null, "WESTERN_MEDICINE", null,
                code, display, diagnosisType, verificationStatus, null, updatedBy);
    }

    EncounterDiagnosis(Long tenantId, Long encounterId, String diagnosisStage, Long conceptId,
                       String codeSystemCode, String codeSystemVersion, String diagnosisDomain,
                       String diagnosisGroupId, String code, String display, DiagnosisType diagnosisType,
                       String verificationStatus, String managementSnapshotJson, Long updatedBy) {
        this(tenantId, encounterId, diagnosisStage, conceptId, codeSystemCode, codeSystemVersion,
                diagnosisDomain, diagnosisGroupId, code, display, diagnosisType, verificationStatus,
                managementSnapshotJson, 1, updatedBy);
    }

    EncounterDiagnosis(Long tenantId, Long encounterId, String diagnosisStage, Long conceptId,
                       String codeSystemCode, String codeSystemVersion, String diagnosisDomain,
                       String diagnosisGroupId, String code, String display, DiagnosisType diagnosisType,
                       String verificationStatus, String managementSnapshotJson, int sortOrder, Long updatedBy) {
        this.id = com.rhn.shared.id.GlobalIds.next();
        this.tenantId = tenantId;
        this.encounterId = encounterId;
        this.diagnosisStage = diagnosisStage;
        this.conceptId = conceptId;
        this.codeSystemCodeSnapshot = codeSystemCode;
        this.codeSystemVersionSnapshot = codeSystemVersion;
        this.diagnosisDomain = diagnosisDomain == null ? "WESTERN_MEDICINE" : diagnosisDomain;
        this.diagnosisGroupId = diagnosisGroupId;
        this.sortOrder = sortOrder;
        this.code = code;
        this.display = display;
        this.managementSnapshotJson = managementSnapshotJson;
        this.diagnosisType = diagnosisType;
        this.recordedAt = Instant.now();
        this.businessVersionNo = 1;
        this.verificationStatus = verificationStatus;
        this.diagnosisStatus = "ACTIVE";
        this.updatedAt = recordedAt;
        this.updatedBy = updatedBy;
    }

    void revise(String display, DiagnosisType type, Long actor) {
        revise(display, type, "CONFIRMED", actor);
    }

    void revise(String display, DiagnosisType type, String verificationStatus, Long actor) {
        revise(conceptId, codeSystemCodeSnapshot, codeSystemVersionSnapshot, diagnosisDomain, diagnosisGroupId,
                display, type, verificationStatus, managementSnapshotJson, actor);
    }

    void revise(Long conceptId, String codeSystemCode, String codeSystemVersion, String diagnosisDomain,
                String diagnosisGroupId, String display, DiagnosisType type, String verificationStatus,
                String managementSnapshotJson, Long actor) {
        revise(conceptId, codeSystemCode, codeSystemVersion, diagnosisDomain, diagnosisGroupId, display,
                type, verificationStatus, managementSnapshotJson, sortOrder, actor);
    }

    void revise(Long conceptId, String codeSystemCode, String codeSystemVersion, String diagnosisDomain,
                String diagnosisGroupId, String display, DiagnosisType type, String verificationStatus,
                String managementSnapshotJson, int sortOrder, Long actor) {
        this.conceptId = conceptId;
        this.codeSystemCodeSnapshot = codeSystemCode;
        this.codeSystemVersionSnapshot = codeSystemVersion;
        this.diagnosisDomain = diagnosisDomain == null ? "WESTERN_MEDICINE" : diagnosisDomain;
        this.diagnosisGroupId = diagnosisGroupId;
        this.sortOrder = sortOrder;
        this.display = display;
        this.diagnosisType = type;
        this.verificationStatus = verificationStatus;
        this.managementSnapshotJson = managementSnapshotJson;
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
    Long conceptId() { return conceptId; }
    String diagnosisStage() { return diagnosisStage; }
    String code() { return code; }
    String display() { return display; }
    String codeSystemCodeSnapshot() { return codeSystemCodeSnapshot; }
    String codeSystemVersionSnapshot() { return codeSystemVersionSnapshot; }
    String diagnosisDomain() { return diagnosisDomain; }
    String diagnosisGroupId() { return diagnosisGroupId; }
    int sortOrder() { return sortOrder; }
    String managementSnapshotJson() { return managementSnapshotJson; }
    String terminologyKey() { return (codeSystemCodeSnapshot == null ? "LEGACY" : codeSystemCodeSnapshot) + "|" + code; }
    DiagnosisType diagnosisType() { return diagnosisType; }
    int businessVersionNo() { return businessVersionNo; }
    String verificationStatus() { return verificationStatus; }
    String diagnosisStatus() { return diagnosisStatus; }
    String clinicalNote() { return clinicalNote; }
}
