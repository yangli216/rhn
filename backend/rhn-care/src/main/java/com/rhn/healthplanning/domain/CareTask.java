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
@Table(name = "RHN_HPL_CARE_TASK")
public class CareTask {
    @Id @Column(name = "ID_CARE_TASK") private Long id;
    @Version @Column(name = "REVISION", nullable = false) private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_PAT", nullable = false) private Long residentId;
    @Column(name = "ID_ENC") private Long encounterId;
    @Column(name = "ID_CARE_PLAN") private Long carePlanId;
    @Column(name = "ID_CARE_REQ") private Long requestId;
    @Column(name = "ID_REPORT_EVT") private Long reportEventId;
    @Column(name = "ID_COND") private Long conditionId;
    @Column(name = "CD_TASK", nullable = false) private String taskCode;
    @Enumerated(EnumType.STRING) @Column(name = "SD_TASK_TYPE", nullable = false) private CareTaskType taskType;
    @Enumerated(EnumType.STRING) @Column(name = "SD_STATUS", nullable = false) private CareTaskStatus status;
    @Enumerated(EnumType.STRING) @Column(name = "SD_PRIORITY", nullable = false) private CareTaskPriority priority;
    @Column(name = "ID_PRACT_OWNER") private Long ownerPractitionerId;
    @Column(name = "ID_ORG_OWNER") private Long ownerOrganizationId;
    @Column(name = "ID_DEPT_OWNER") private Long ownerDepartmentId;
    @Column(name = "DT_DUE") private Instant dueAt;
    @Column(name = "CD_ESCALATION_RULE") private String escalationRuleCode;
    @Column(name = "NA_TITLE", nullable = false) private String title;
    @Column(name = "DES_CARE_TASK") private String description;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_PRACT_CREATOR", nullable = false) private Long creatorPractitionerId;
    @Column(name = "ID_USER_CREATOR", nullable = false) private Long creatorUserId;

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
