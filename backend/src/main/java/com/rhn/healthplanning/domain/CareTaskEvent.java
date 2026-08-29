package com.rhn.healthplanning.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "care_task_events")
public class CareTaskEvent {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "care_task_id", nullable = false) private Long careTaskId;
    @Column(name = "event_type", nullable = false) private String eventType;
    @Column(name = "status_from") private String statusFrom;
    @Column(name = "status_to", nullable = false) private String statusTo;
    @Column(name = "actor_practitioner_id") private Long actorPractitionerId;
    @Column(name = "actor_user_id") private Long actorUserId;
    @Column(name = "command_code", nullable = false) private String commandCode;
    @Column(name = "result_description") private String resultDescription;
    @Column(name = "rule_code") private String ruleCode;
    @Column(name = "rule_version") private String ruleVersion;
    @Lob @Column(name = "evidence_json") private String evidenceJson;
    @Column(name = "evidence_hash") private String evidenceHash;
    @Column(name = "occurred_at", nullable = false) private Instant occurredAt;

    protected CareTaskEvent() {
    }

    public CareTaskEvent(CareTask task, boolean created, String commandCode, String resultDescription,
                         String ruleCode, String ruleVersion, String evidenceJson, String evidenceHash,
                         Long practitionerId, Long userId, Instant occurredAt) {
        this.id = GlobalIds.next();
        this.tenantId = task.tenantId();
        this.careTaskId = task.id();
        this.eventType = created ? "CREATE" : "EVIDENCE_RECORDED";
        this.statusFrom = created ? null : task.status().name();
        this.statusTo = task.status().name();
        this.actorPractitionerId = practitionerId;
        this.actorUserId = userId;
        this.commandCode = commandCode;
        this.resultDescription = resultDescription;
        this.ruleCode = ruleCode;
        this.ruleVersion = ruleVersion;
        this.evidenceJson = evidenceJson;
        this.evidenceHash = evidenceHash;
        this.occurredAt = occurredAt;
    }

    public Long id() { return id; }
    public Long careTaskId() { return careTaskId; }
    public String eventType() { return eventType; }
    public String statusFrom() { return statusFrom; }
    public String statusTo() { return statusTo; }
    public String commandCode() { return commandCode; }
    public String resultDescription() { return resultDescription; }
    public String ruleCode() { return ruleCode; }
    public String ruleVersion() { return ruleVersion; }
    public String evidenceJson() { return evidenceJson; }
    public String evidenceHash() { return evidenceHash; }
    public Instant occurredAt() { return occurredAt; }
}
