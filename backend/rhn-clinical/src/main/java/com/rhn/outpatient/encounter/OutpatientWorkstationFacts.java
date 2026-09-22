package com.rhn.outpatient.encounter;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "RHN_VIS_ENC_IDENT_CHECK")
class EncounterIdentityCheck {
    @Id @Column(name = "ID_ENC_IDENT_CHECK") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_PAT", nullable = false) private Long residentId;
    @Column(name = "ID_ENC", nullable = false) private Long encounterId;
    @Column(name = "SD_CHECK_SCEN", nullable = false) private String checkScenario;
    @Lob @Column(name = "JSON_FACTOR_RESULT", nullable = false) private String factorResultsJson;
    @Column(name = "SD_RESULT", nullable = false) private String result;
    @Column(name = "ID_PRACT") private Long practitionerId;
    @Column(name = "ID_USER") private Long userId;
    @Column(name = "CD_TRMNL") private String terminalCode;
    @Column(name = "CD_COMMAND", nullable = false) private String commandCode;
    @Column(name = "DT_OCCRD", nullable = false) private Instant occurredAt;

    protected EncounterIdentityCheck() {}

    EncounterIdentityCheck(Long tenantId, Long residentId, Long encounterId, String factorResultsJson,
                           Long practitionerId, Long userId, String terminalCode, String commandCode) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.residentId = residentId;
        this.encounterId = encounterId;
        this.checkScenario = "START";
        this.factorResultsJson = factorResultsJson;
        this.result = "PASS";
        this.practitionerId = practitionerId;
        this.userId = userId;
        this.terminalCode = terminalCode;
        this.commandCode = commandCode;
        this.occurredAt = Instant.now();
    }
}

@Entity
@Table(name = "RHN_VIS_ENC_STATUS_EVT")
class EncounterStatusEvent {
    @Id @Column(name = "ID_ENC_STATUS_EVT") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_ENC", nullable = false) private Long encounterId;
    @Column(name = "SD_STATUS_FROM") private String statusFrom;
    @Column(name = "SD_STATUS_TO", nullable = false) private String statusTo;
    @Column(name = "SN_EXPCTD_VER", nullable = false) private long expectedRevision;
    @Column(name = "ID_PRACT") private Long practitionerId;
    @Column(name = "ID_USER") private Long userId;
    @Column(name = "ID_ORG", nullable = false) private Long organizationId;
    @Column(name = "ID_DEPT", nullable = false) private Long departmentId;
    @Column(name = "CD_COMMAND", nullable = false) private String commandCode;
    @Column(name = "DES_REASON") private String reason;
    @Column(name = "DT_OCCRD", nullable = false) private Instant occurredAt;

    protected EncounterStatusEvent() {}

    EncounterStatusEvent(Encounter encounter, String from, String to, long expectedRevision,
                         Long practitionerId, Long userId, String commandCode, String reason) {
        this.id = GlobalIds.next();
        this.tenantId = encounter.tenantId();
        this.encounterId = encounter.id();
        this.statusFrom = from;
        this.statusTo = to;
        this.expectedRevision = expectedRevision;
        this.practitionerId = practitionerId;
        this.userId = userId;
        this.organizationId = encounter.organizationId();
        this.departmentId = encounter.departmentId();
        this.commandCode = commandCode;
        this.reason = reason;
        this.occurredAt = Instant.now();
    }
}

@Entity
@Table(name = "RHN_VIS_ENC_WORK_SESSION")
class EncounterWorkSession {
    @Id @Column(name = "ID_ENC_WORK_SESSION") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_ENC", nullable = false) private Long encounterId;
    @Column(name = "ID_PRACT") private Long practitionerId;
    @Column(name = "ID_USER") private Long userId;
    @Column(name = "CD_TRMNL") private String terminalCode;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DT_STARTED", nullable = false) private Instant startedAt;
    @Column(name = "DT_HRTBT", nullable = false) private Instant heartbeatAt;
    @Column(name = "DT_CLOSED") private Instant closedAt;
    @Column(name = "DES_CLOSE_REASON") private String closeReason;

    protected EncounterWorkSession() {}

    EncounterWorkSession(Long tenantId, Long encounterId, Long practitionerId, Long userId, String terminalCode) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.encounterId = encounterId;
        this.practitionerId = practitionerId;
        this.userId = userId;
        this.terminalCode = terminalCode;
        this.status = "ACTIVE";
        this.startedAt = Instant.now();
        this.heartbeatAt = startedAt;
    }

    void close(String reason) {
        if (!"ACTIVE".equals(status)) return;
        status = "CLOSED";
        closeReason = reason;
        closedAt = Instant.now();
        heartbeatAt = closedAt;
    }
}

@Entity
@Table(name = "RHN_VIS_ENC_DIAG_REV")
class EncounterDiagnosisRevision {
    @Id @Column(name = "ID_ENC_DIAG_REV") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_ENC_DIAG", nullable = false) private Long encounterDiagnosisId;
    @Column(name = "ID_ENC", nullable = false) private Long encounterId;
    @Column(name = "SD_DIAG_STAGE", nullable = false) private String diagnosisStage;
    @Column(name = "CD_BIZ_VER_NO", nullable = false) private int businessVersionNo;
    @Column(name = "SD_CHG_TYPE", nullable = false) private String changeType;
    @Column(name = "SD_DIAG_TYPE", nullable = false) private String diagnosisType;
    @Column(name = "SD_VRFCTN_STATUS", nullable = false) private String verificationStatus;
    @Column(name = "SD_DIAG_STATUS", nullable = false) private String diagnosisStatus;
    @Column(name = "CD_CODE_SNAP", nullable = false) private String codeSnapshot;
    @Column(name = "NA_DISPLAY_SNAP", nullable = false) private String displaySnapshot;
    @Column(name = "ID_CONCEPT") private Long conceptId;
    @Column(name = "CD_CODE_SYS_SNAP") private String codeSystemCodeSnapshot;
    @Column(name = "CODE_SYSTEM_VERSION_SNAP") private String codeSystemVersionSnapshot;
    @Column(name = "SD_DIAG_DOMAIN", nullable = false) private String diagnosisDomain;
    @Column(name = "ID_DIAG_GRP") private String diagnosisGroupId;
    @Column(name = "JSON_MGMT_SNAP") private String managementSnapshotJson;
    @Column(name = "DES_CLIN_NOTE") private String clinicalNote;
    @Column(name = "DES_CHG_REASON", nullable = false) private String changeReason;
    @Column(name = "ID_PRACT") private Long practitionerId;
    @Column(name = "ID_USER") private Long userId;
    @Column(name = "DT_OCCRD", nullable = false) private Instant occurredAt;

    protected EncounterDiagnosisRevision() {}

    EncounterDiagnosisRevision(EncounterDiagnosis diagnosis, String changeType, String changeReason,
                               Long practitionerId, Long userId) {
        this.id = GlobalIds.next();
        this.tenantId = diagnosis.tenantId();
        this.encounterDiagnosisId = diagnosis.id();
        this.encounterId = diagnosis.encounterId();
        this.diagnosisStage = diagnosis.diagnosisStage();
        this.businessVersionNo = diagnosis.businessVersionNo();
        this.changeType = changeType;
        this.diagnosisType = diagnosis.diagnosisType().name();
        this.verificationStatus = diagnosis.verificationStatus();
        this.diagnosisStatus = diagnosis.diagnosisStatus();
        this.codeSnapshot = diagnosis.code();
        this.displaySnapshot = diagnosis.display();
        this.conceptId = diagnosis.conceptId();
        this.codeSystemCodeSnapshot = diagnosis.codeSystemCodeSnapshot();
        this.codeSystemVersionSnapshot = diagnosis.codeSystemVersionSnapshot();
        this.diagnosisDomain = diagnosis.diagnosisDomain();
        this.diagnosisGroupId = diagnosis.diagnosisGroupId();
        this.managementSnapshotJson = diagnosis.managementSnapshotJson();
        this.clinicalNote = diagnosis.clinicalNote();
        this.changeReason = changeReason;
        this.practitionerId = practitionerId;
        this.userId = userId;
        this.occurredAt = Instant.now();
    }
}

@Entity
@Table(name = "RHN_VIS_ENC_COMP_CHECK")
class EncounterCompletionCheck {
    @Id @Column(name = "ID_ENC_COMP_CHECK") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_ENC", nullable = false) private Long encounterId;
    @Column(name = "SN_EXPCTD_VER", nullable = false) private long expectedRevision;
    @Column(name = "SD_RESULT", nullable = false) private String result;
    @Column(name = "CD_COMMAND", nullable = false) private String commandCode;
    @Column(name = "ID_PRACT") private Long practitionerId;
    @Column(name = "ID_USER") private Long userId;
    @Column(name = "DT_CHECKED", nullable = false) private Instant checkedAt;

    protected EncounterCompletionCheck() {}

    EncounterCompletionCheck(Long tenantId, Long encounterId, long expectedRevision, boolean passed,
                             String commandCode, Long practitionerId, Long userId) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.encounterId = encounterId;
        this.expectedRevision = expectedRevision;
        this.result = passed ? "PASS" : "BLOCKED";
        this.commandCode = commandCode;
        this.practitionerId = practitionerId;
        this.userId = userId;
        this.checkedAt = Instant.now();
    }

    Long id() { return id; }
}

@Entity
@Table(name = "RHN_VIS_ENC_COMP_ISSUE")
class EncounterCompletionIssue {
    @Id @Column(name = "ID_ENC_COMP_ISSUE") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_ENC_COMP_CHECK", nullable = false) private Long completionCheckId;
    @Column(name = "CD_ISSUE", nullable = false) private String issueCode;
    @Column(name = "SD_SEV", nullable = false) private String severity;
    @Column(name = "DES_ENC_COMP_ISSUE", nullable = false) private String description;

    protected EncounterCompletionIssue() {}

    EncounterCompletionIssue(Long tenantId, Long completionCheckId, String issueCode, String description) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.completionCheckId = completionCheckId;
        this.issueCode = issueCode;
        this.severity = "BLOCKER";
        this.description = description;
    }
}
