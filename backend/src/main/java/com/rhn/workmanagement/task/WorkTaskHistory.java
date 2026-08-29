package com.rhn.workmanagement.task;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "work_task_history")
class WorkTaskHistory {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "task_id", nullable = false) private Long taskId;
    @Column(nullable = false) private String action;
    @Column(name = "from_status") private String fromStatus;
    @Column(name = "to_status", nullable = false) private String toStatus;
    @Column(name = "actor_id") private Long actorId;
    @Column(name = "comment_text") private String comment;
    @Column(name = "correlation_id", nullable = false) private String correlationId;
    @Column(name = "occurred_at", nullable = false) private Instant occurredAt;

    protected WorkTaskHistory() {
    }

    WorkTaskHistory(WorkTask task, String action, TaskStatus fromStatus, Long actorId,
                    String comment, String correlationId) {
        this.id = GlobalIds.next();
        this.tenantId = task.tenantId();
        this.taskId = task.id();
        this.action = action;
        this.fromStatus = fromStatus == null ? null : fromStatus.name();
        this.toStatus = task.status().name();
        this.actorId = actorId;
        this.comment = comment;
        this.correlationId = correlationId;
        this.occurredAt = Instant.now();
    }
}
