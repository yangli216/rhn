package com.rhn.workmanagement.task;

import com.rhn.shared.api.BusinessErrors;
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
@Table(name = "RHN_SYS_WORK_TASK")
public class WorkTask {
    @Id @Column(name = "ID_WORK_TASK") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_ORG") private Long organizationId;
    @Column(name = "ID_DEPT") private Long departmentId;
    @Column(name = "SD_TASK_TYPE", nullable = false) private String taskType;
    @Column(name = "NA_TITLE", nullable = false) private String title;
    @Column(name = "DES_SUM") private String summary;
    @Enumerated(EnumType.STRING) @Column(name = "SD_PRIORITY", nullable = false) private TaskPriority priority;
    @Enumerated(EnumType.STRING) @Column(name = "SD_STATUS", nullable = false) private TaskStatus status;
    @Enumerated(EnumType.STRING) @Column(name = "SD_ASSIGNEE_TYPE", nullable = false) private AssigneeType assigneeType;
    @Column(name = "ID_USER_ASSIGNEE") private Long assigneeId;
    @Column(name = "ID_PAT") private Long residentId;
    @Column(name = "ID_ENC") private Long encounterId;
    @Column(name = "SD_SRC_TYPE", nullable = false) private String sourceType;
    @Column(name = "ID_SRC", nullable = false) private Long sourceId;
    @Column(name = "ROUTE_PATH") private String routePath;
    @Column(name = "CD_DEDUP_KEY", nullable = false) private String dedupKey;
    @Column(name = "DT_DUE") private Instant dueAt;
    @Column(name = "ID_USER_CLAIMED") private Long claimedBy;
    @Column(name = "DT_CLAIMED") private Instant claimedAt;
    @Column(name = "ID_USER_COMPLETED") private Long completedBy;
    @Column(name = "DT_COMPLETED") private Instant completedAt;
    @Column(name = "ID_USER_CREATED") private Long createdBy;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Version @Column(name = "REVISION", nullable = false) private long revision;

    protected WorkTask() {
    }

    public static WorkTask departmentTask(Long tenantId, Long organizationId, Long departmentId,
                                          String taskType, String title, String summary, TaskPriority priority,
                                          Long residentId, Long encounterId, String sourceType, Long sourceId,
                                          String routePath, String dedupKey, Instant dueAt, Long actorId) {
        WorkTask task = new WorkTask();
        task.id = GlobalIds.next();
        task.tenantId = tenantId;
        task.organizationId = organizationId;
        task.departmentId = departmentId;
        task.taskType = taskType;
        task.title = title;
        task.summary = summary;
        task.priority = priority;
        task.status = TaskStatus.READY;
        task.assigneeType = AssigneeType.DEPARTMENT;
        task.residentId = residentId;
        task.encounterId = encounterId;
        task.sourceType = sourceType;
        task.sourceId = sourceId;
        task.routePath = routePath;
        task.dedupKey = dedupKey;
        task.dueAt = dueAt;
        task.createdBy = actorId;
        task.createdAt = Instant.now();
        task.updatedAt = task.createdAt;
        return task;
    }

    public static WorkTask userTask(Long tenantId, Long organizationId, Long departmentId, Long assigneeId,
                                    String taskType, String title, String summary, TaskPriority priority,
                                    Long residentId, Long encounterId, String sourceType, Long sourceId,
                                    String routePath, String dedupKey, Instant dueAt, Long actorId) {
        WorkTask task = departmentTask(tenantId, organizationId, departmentId, taskType, title, summary,
                priority, residentId, encounterId, sourceType, sourceId, routePath, dedupKey, dueAt, actorId);
        task.assigneeType = AssigneeType.USER;
        task.assigneeId = assigneeId;
        return task;
    }

    public TaskStatus claim(Long actorId) {
        if (status == TaskStatus.COMPLETED || status == TaskStatus.CANCELLED) {
            throw BusinessErrors.conflict("TASK_STATE_INVALID", "已结束任务不能认领");
        }
        if (claimedBy != null && !claimedBy.equals(actorId)) {
            throw BusinessErrors.conflict("TASK_ALREADY_CLAIMED", "任务已被其他用户认领");
        }
        TaskStatus before = status;
        claimedBy = actorId;
        claimedAt = Instant.now();
        status = TaskStatus.IN_PROGRESS;
        updatedAt = claimedAt;
        return before;
    }

    public TaskStatus complete(Long actorId) {
        if (status == TaskStatus.COMPLETED) return TaskStatus.COMPLETED;
        if (status == TaskStatus.CANCELLED) throw BusinessErrors.conflict("TASK_STATE_INVALID", "已取消任务不能完成");
        TaskStatus before = status;
        completedBy = actorId;
        completedAt = Instant.now();
        status = TaskStatus.COMPLETED;
        updatedAt = completedAt;
        return before;
    }

    public TaskStatus cancel() {
        if (status == TaskStatus.COMPLETED) throw BusinessErrors.conflict("TASK_STATE_INVALID", "已完成任务不能取消");
        TaskStatus before = status;
        status = TaskStatus.CANCELLED;
        updatedAt = Instant.now();
        return before;
    }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public Long organizationId() { return organizationId; }
    public Long departmentId() { return departmentId; }
    public String taskType() { return taskType; }
    public String title() { return title; }
    public String summary() { return summary; }
    public TaskPriority priority() { return priority; }
    public TaskStatus status() { return status; }
    public AssigneeType assigneeType() { return assigneeType; }
    public Long assigneeId() { return assigneeId; }
    public Long residentId() { return residentId; }
    public Long encounterId() { return encounterId; }
    public String sourceType() { return sourceType; }
    public Long sourceId() { return sourceId; }
    public String routePath() { return routePath; }
    public Instant dueAt() { return dueAt; }
    public Long claimedBy() { return claimedBy; }
    public Instant claimedAt() { return claimedAt; }
    public Instant completedAt() { return completedAt; }
    public Instant createdAt() { return createdAt; }
    public long revision() { return revision; }
}
