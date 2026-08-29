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
@Table(name = "encounter_identity_checks")
class EncounterIdentityCheck {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "resident_id", nullable = false) private Long residentId;
    @Column(name = "encounter_id", nullable = false) private Long encounterId;
    @Column(name = "check_scenario", nullable = false) private String checkScenario;
    @Lob @Column(name = "factor_results_json", nullable = false) private String factorResultsJson;
    @Column(nullable = false) private String result;
    @Column(name = "practitioner_id") private Long practitionerId;
    @Column(name = "user_id") private Long userId;
    @Column(name = "terminal_code") private String terminalCode;
    @Column(name = "command_code", nullable = false) private String commandCode;
    @Column(name = "occurred_at", nullable = false) private Instant occurredAt;

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
@Table(name = "encounter_status_events")
class EncounterStatusEvent {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "encounter_id", nullable = false) private Long encounterId;
    @Column(name = "status_from") private String statusFrom;
    @Column(name = "status_to", nullable = false) private String statusTo;
    @Column(name = "expected_revision", nullable = false) private long expectedRevision;
    @Column(name = "practitioner_id") private Long practitionerId;
    @Column(name = "user_id") private Long userId;
    @Column(name = "organization_id", nullable = false) private Long organizationId;
    @Column(name = "department_id", nullable = false) private Long departmentId;
    @Column(name = "command_code", nullable = false) private String commandCode;
    private String reason;
    @Column(name = "occurred_at", nullable = false) private Instant occurredAt;

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
@Table(name = "encounter_work_sessions")
class EncounterWorkSession {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "encounter_id", nullable = false) private Long encounterId;
    @Column(name = "practitioner_id") private Long practitionerId;
    @Column(name = "user_id") private Long userId;
    @Column(name = "terminal_code") private String terminalCode;
    @Column(nullable = false) private String status;
    @Column(name = "started_at", nullable = false) private Instant startedAt;
    @Column(name = "heartbeat_at", nullable = false) private Instant heartbeatAt;
    @Column(name = "closed_at") private Instant closedAt;
    @Column(name = "close_reason") private String closeReason;

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
@Table(name = "encounter_diagnosis_revisions")
class EncounterDiagnosisRevision {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "encounter_diagnosis_id", nullable = false) private Long encounterDiagnosisId;
    @Column(name = "encounter_id", nullable = false) private Long encounterId;
    @Column(name = "business_version_no", nullable = false) private int businessVersionNo;
    @Column(name = "change_type", nullable = false) private String changeType;
    @Column(name = "diagnosis_type", nullable = false) private String diagnosisType;
    @Column(name = "verification_status", nullable = false) private String verificationStatus;
    @Column(name = "diagnosis_status", nullable = false) private String diagnosisStatus;
    @Column(name = "code_snapshot", nullable = false) private String codeSnapshot;
    @Column(name = "display_snapshot", nullable = false) private String displaySnapshot;
    @Column(name = "clinical_note") private String clinicalNote;
    @Column(name = "change_reason", nullable = false) private String changeReason;
    @Column(name = "practitioner_id") private Long practitionerId;
    @Column(name = "user_id") private Long userId;
    @Column(name = "occurred_at", nullable = false) private Instant occurredAt;

    protected EncounterDiagnosisRevision() {}

    EncounterDiagnosisRevision(EncounterDiagnosis diagnosis, String changeType, String changeReason,
                               Long practitionerId, Long userId) {
        this.id = GlobalIds.next();
        this.tenantId = diagnosis.tenantId();
        this.encounterDiagnosisId = diagnosis.id();
        this.encounterId = diagnosis.encounterId();
        this.businessVersionNo = diagnosis.businessVersionNo();
        this.changeType = changeType;
        this.diagnosisType = diagnosis.diagnosisType().name();
        this.verificationStatus = diagnosis.verificationStatus();
        this.diagnosisStatus = diagnosis.diagnosisStatus();
        this.codeSnapshot = diagnosis.code();
        this.displaySnapshot = diagnosis.display();
        this.clinicalNote = diagnosis.clinicalNote();
        this.changeReason = changeReason;
        this.practitionerId = practitionerId;
        this.userId = userId;
        this.occurredAt = Instant.now();
    }
}

@Entity
@Table(name = "encounter_completion_checks")
class EncounterCompletionCheck {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "encounter_id", nullable = false) private Long encounterId;
    @Column(name = "expected_revision", nullable = false) private long expectedRevision;
    @Column(nullable = false) private String result;
    @Column(name = "command_code", nullable = false) private String commandCode;
    @Column(name = "practitioner_id") private Long practitionerId;
    @Column(name = "user_id") private Long userId;
    @Column(name = "checked_at", nullable = false) private Instant checkedAt;

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
@Table(name = "encounter_completion_issues")
class EncounterCompletionIssue {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "completion_check_id", nullable = false) private Long completionCheckId;
    @Column(name = "issue_code", nullable = false) private String issueCode;
    @Column(nullable = false) private String severity;
    @Column(nullable = false) private String description;

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
