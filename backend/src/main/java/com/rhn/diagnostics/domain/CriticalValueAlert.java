package com.rhn.diagnostics.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "critical_value_alerts")
public class CriticalValueAlert {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "organization_id", nullable = false) private Long organizationId;
    @Column(name = "department_id", nullable = false) private Long departmentId;
    @Column(name = "report_id", nullable = false) private Long reportId;
    @Column(name = "observation_id", nullable = false) private Long observationId;
    @Column(name = "resident_id", nullable = false) private Long residentId;
    @Column(name = "encounter_id", nullable = false) private Long encounterId;
    @Column(name = "request_id", nullable = false) private Long requestId;
    @Column(name = "recipient_user_id", nullable = false) private Long recipientUserId;
    @Column(nullable = false) private String severity;
    @Column(name = "rule_code", nullable = false) private String ruleCode;
    @Column(name = "rule_version", nullable = false) private int ruleVersion;
    @Column(name = "observation_code", nullable = false) private String observationCode;
    @Column(name = "observation_name", nullable = false) private String observationName;
    @Column(name = "trigger_evidence", nullable = false) private String triggerEvidence;
    @Column(nullable = false) private String status;
    @Column(name = "detected_at", nullable = false) private Instant detectedAt;
    @Column(name = "acknowledge_deadline_at", nullable = false) private Instant acknowledgeDeadlineAt;
    @Column(name = "acknowledged_by") private Long acknowledgedBy;
    @Column(name = "acknowledged_at") private Instant acknowledgedAt;
    @Column(name = "acknowledge_note") private String acknowledgeNote;
    @Column(name = "closed_by") private Long closedBy;
    @Column(name = "closed_at") private Instant closedAt;
    @Column(name = "disposition_code") private String dispositionCode;
    @Column(name = "close_note") private String closeNote;
    @Column(name = "superseded_by_report_id") private Long supersededByReportId;
    @Column(name = "escalation_level", nullable = false) private int escalationLevel;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;

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
