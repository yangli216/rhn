package com.rhn.diagnostics.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "RHN_VIS_CRIT_VAL_ALERT")
public class CriticalValueAlert {
    @Id @Column(name = "ID_CRIT_VAL_ALERT") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_ORG", nullable = false) private Long organizationId;
    @Column(name = "ID_DEPT", nullable = false) private Long departmentId;
    @Column(name = "ID_DIAG_REPORT", nullable = false) private Long reportId;
    @Column(name = "ID_OBS", nullable = false) private Long observationId;
    @Column(name = "ID_PAT", nullable = false) private Long residentId;
    @Column(name = "ID_ENC", nullable = false) private Long encounterId;
    @Column(name = "ID_CARE_REQ", nullable = false) private Long requestId;
    @Column(name = "ID_USER_RCPNT", nullable = false) private Long recipientUserId;
    @Column(name = "SD_SEV", nullable = false) private String severity;
    @Column(name = "CD_RULE", nullable = false) private String ruleCode;
    @Column(name = "SN_RULE_VER", nullable = false) private int ruleVersion;
    @Column(name = "CD_OBS", nullable = false) private String observationCode;
    @Column(name = "NA_OBS", nullable = false) private String observationName;
    @Column(name = "DES_TRIGGER_EVID", nullable = false) private String triggerEvidence;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DT_DTCTD", nullable = false) private Instant detectedAt;
    @Column(name = "DT_ACK_DDLN", nullable = false) private Instant acknowledgeDeadlineAt;
    @Column(name = "ID_USER_ACKD") private Long acknowledgedBy;
    @Column(name = "DT_ACKD") private Instant acknowledgedAt;
    @Column(name = "DES_ACK_NOTE") private String acknowledgeNote;
    @Column(name = "ID_USER_CLOSED") private Long closedBy;
    @Column(name = "DT_CLOSED") private Instant closedAt;
    @Column(name = "CD_DISPOS") private String dispositionCode;
    @Column(name = "DES_CLOSE_NOTE") private String closeNote;
    @Column(name = "ID_DIAG_REPORT_SPRSDD") private Long supersededByReportId;
    @Column(name = "SD_ESCLN_LEVEL", nullable = false) private int escalationLevel;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;

    protected CriticalValueAlert() {}

    public CriticalValueAlert(Long tenantId, Long organizationId, Long departmentId, Long reportId,
                              Long observationId, Long residentId, Long encounterId, Long requestId,
                              Long recipientUserId, String severity, String ruleCode, int ruleVersion,
                              String observationCode, String observationName, String triggerEvidence,
                              Instant detectedAt, Instant acknowledgeDeadlineAt) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.organizationId = organizationId;
        this.departmentId = departmentId; this.reportId = reportId; this.observationId = observationId;
        this.residentId = residentId; this.encounterId = encounterId; this.requestId = requestId;
        this.recipientUserId = recipientUserId; this.severity = severity; this.ruleCode = ruleCode;
        this.ruleVersion = ruleVersion; this.observationCode = observationCode;
        this.observationName = observationName; this.triggerEvidence = triggerEvidence;
        this.status = "OPEN"; this.detectedAt = detectedAt;
        this.acknowledgeDeadlineAt = acknowledgeDeadlineAt; this.escalationLevel = 0; this.updatedAt = detectedAt;
    }

    public void acknowledge(Long actorId, String note, Instant occurredAt) {
        if (!"OPEN".equals(status) && !"ESCALATED".equals(status)) {
            throw new IllegalStateException("当前危急值状态不能确认");
        }
        status = "ACKNOWLEDGED"; acknowledgedBy = actorId; acknowledgedAt = occurredAt;
        acknowledgeNote = note; updatedAt = occurredAt;
    }

    public void close(Long actorId, String disposition, String note, Instant occurredAt) {
        if (!"ACKNOWLEDGED".equals(status)) throw new IllegalStateException("危急值必须先确认再关闭");
        status = "CLOSED"; closedBy = actorId; closedAt = occurredAt;
        dispositionCode = disposition; closeNote = note; updatedAt = occurredAt;
    }

    public void supersede(Long replacementReportId, Instant occurredAt) {
        if ("CLOSED".equals(status) || "SUPERSEDED".equals(status)) return;
        status = "SUPERSEDED"; supersededByReportId = replacementReportId; updatedAt = occurredAt;
    }

    public void escalate(Instant occurredAt) {
        if (!"OPEN".equals(status) && !"ESCALATED".equals(status)) return;
        status = "ESCALATED"; escalationLevel++; updatedAt = occurredAt;
    }

    public Long id() { return id; } public long revision() { return revision; }
    public Long tenantId() { return tenantId; } public Long organizationId() { return organizationId; }
    public Long departmentId() { return departmentId; } public Long reportId() { return reportId; }
    public Long observationId() { return observationId; } public Long residentId() { return residentId; }
    public Long encounterId() { return encounterId; } public Long requestId() { return requestId; }
    public Long recipientUserId() { return recipientUserId; } public String severity() { return severity; }
    public String ruleCode() { return ruleCode; } public int ruleVersion() { return ruleVersion; }
    public String observationCode() { return observationCode; } public String observationName() { return observationName; }
    public String triggerEvidence() { return triggerEvidence; } public String status() { return status; }
    public Instant detectedAt() { return detectedAt; } public Instant acknowledgeDeadlineAt() { return acknowledgeDeadlineAt; }
    public Long acknowledgedBy() { return acknowledgedBy; } public Instant acknowledgedAt() { return acknowledgedAt; }
    public String acknowledgeNote() { return acknowledgeNote; } public Long closedBy() { return closedBy; }
    public Instant closedAt() { return closedAt; } public String dispositionCode() { return dispositionCode; }
    public String closeNote() { return closeNote; } public Long supersededByReportId() { return supersededByReportId; }
    public int escalationLevel() { return escalationLevel; }
}
