package com.rhn.healthplanning.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "care_tasks")
public class CareTask {
    @Id private Long id;
    @Version @Column(nullable = false) private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "resident_id", nullable = false) private Long residentId;
    @Column(name = "encounter_id") private Long encounterId;
    @Column(name = "care_plan_id") private Long carePlanId;
    @Column(name = "request_id") private Long requestId;
    @Column(name = "report_event_id") private Long reportEventId;
    @Column(name = "condition_id") private Long conditionId;
    @Column(name = "task_code", nullable = false) private String taskCode;
    @Enumerated(EnumType.STRING) @Column(name = "task_type", nullable = false) private CareTaskType taskType;
    @Enumerated(EnumType.STRING) @Column(nullable = false) private CareTaskStatus status;
    @Enumerated(EnumType.STRING) @Column(nullable = false) private CareTaskPriority priority;
    @Column(name = "owner_practitioner_id") private Long ownerPractitionerId;
    @Column(name = "owner_organization_id") private Long ownerOrganizationId;
    @Column(name = "owner_department_id") private Long ownerDepartmentId;
    @Column(name = "due_at") private Instant dueAt;
    @Column(name = "escalation_rule_code") private String escalationRuleCode;
    @Column(nullable = false) private String title;
    private String description;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "creator_practitioner_id", nullable = false) private Long creatorPractitionerId;
    @Column(name = "creator_user_id", nullable = false) private Long creatorUserId;

    protected CareTask() {
    }

    public static CareTask hypertensionRecheck(Long tenantId, Long residentId, Long encounterId,
                                                Long conditionId, String taskCode,
                                                Long organizationId, Long departmentId,
                                                CareTaskPriority priority, Instant dueAt,
                                                String title, String description,
                                                Long practitionerId, Long userId) {
        CareTask task = new CareTask();
        task.id = GlobalIds.next();
        task.tenantId = tenantId;
        task.residentId = residentId;
        task.encounterId = encounterId;
        task.conditionId = conditionId;
        task.taskCode = taskCode;
        task.taskType = CareTaskType.RECHECK;
        task.status = CareTaskStatus.READY;
        task.priority = priority;
        task.ownerOrganizationId = organizationId;
        task.ownerDepartmentId = departmentId;
        task.dueAt = dueAt;
        task.escalationRuleCode = "WS_T_872_2025.INITIAL_REFERRAL";
        task.title = title;
        task.description = description;
        task.createdAt = Instant.now();
        task.creatorPractitionerId = practitionerId;
        task.creatorUserId = userId;
        return task;
    }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long residentId() { return residentId; }
    public Long encounterId() { return encounterId; }
    public Long conditionId() { return conditionId; }
    public String taskCode() { return taskCode; }
    public CareTaskType taskType() { return taskType; }
    public CareTaskStatus status() { return status; }
    public CareTaskPriority priority() { return priority; }
    public Long ownerOrganizationId() { return ownerOrganizationId; }
    public Long ownerDepartmentId() { return ownerDepartmentId; }
    public Instant dueAt() { return dueAt; }
    public String escalationRuleCode() { return escalationRuleCode; }
    public String title() { return title; }
    public String description() { return description; }
    public Instant createdAt() { return createdAt; }
}
