package com.rhn.healthplanning.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "RHN_HPL_CARE_TASK_EVT")
public class CareTaskEvent {
    @Id @Column(name = "ID_CARE_TASK_EVT") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_CARE_TASK", nullable = false) private Long careTaskId;
    @Column(name = "SD_EVT_TYPE", nullable = false) private String eventType;
    @Column(name = "SD_STATUS_FROM") private String statusFrom;
    @Column(name = "SD_STATUS_TO", nullable = false) private String statusTo;
    @Column(name = "ID_PRACT_ACTOR") private Long actorPractitionerId;
    @Column(name = "ID_USER_ACTOR") private Long actorUserId;
    @Column(name = "CD_COMMAND", nullable = false) private String commandCode;
    @Column(name = "DES_RESULT_DESCR") private String resultDescription;
    @Column(name = "CD_RULE") private String ruleCode;
    @Column(name = "CD_RULE_VER") private String ruleVersion;
    @Lob @Column(name = "JSON_EVID") private String evidenceJson;
    @Column(name = "HASH_EVID") private String evidenceHash;
    @Column(name = "DT_OCCRD", nullable = false) private Instant occurredAt;

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
