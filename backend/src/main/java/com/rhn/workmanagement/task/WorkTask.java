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
@Table(name = "work_tasks")
public class WorkTask {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "organization_id") private Long organizationId;
    @Column(name = "department_id") private Long departmentId;
    @Column(name = "task_type", nullable = false) private String taskType;
    @Column(nullable = false) private String title;
    private String summary;
    @Enumerated(EnumType.STRING) @Column(nullable = false) private TaskPriority priority;
    @Enumerated(EnumType.STRING) @Column(nullable = false) private TaskStatus status;
    @Enumerated(EnumType.STRING) @Column(name = "assignee_type", nullable = false) private AssigneeType assigneeType;
    @Column(name = "assignee_id") private Long assigneeId;
    @Column(name = "resident_id") private Long residentId;
    @Column(name = "encounter_id") private Long encounterId;
    @Column(name = "source_type", nullable = false) private String sourceType;
    @Column(name = "source_id", nullable = false) private Long sourceId;
    @Column(name = "route_path") private String routePath;
    @Column(name = "dedup_key", nullable = false) private String dedupKey;
    @Column(name = "due_at") private Instant dueAt;
    @Column(name = "claimed_by") private Long claimedBy;
    @Column(name = "claimed_at") private Instant claimedAt;
    @Column(name = "completed_by") private Long completedBy;
    @Column(name = "completed_at") private Instant completedAt;
    @Column(name = "created_by") private Long createdBy;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Version @Column(nullable = false) private long revision;

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
