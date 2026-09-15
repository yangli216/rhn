package com.rhn.workmanagement.task;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "RHN_SYS_WORK_TASK_HIST")
class WorkTaskHistory {
    @Id @Column(name = "ID_WORK_TASK_HIST") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_WORK_TASK", nullable = false) private Long taskId;
    @Column(name = "SD_ACTION", nullable = false) private String action;
    @Column(name = "SD_FROM_STATUS") private String fromStatus;
    @Column(name = "SD_TO_STATUS", nullable = false) private String toStatus;
    @Column(name = "ID_USER_ACTOR") private Long actorId;
    @Column(name = "DES_COMMENT") private String comment;
    @Column(name = "ID_CORRELATION", nullable = false) private String correlationId;
    @Column(name = "DT_OCCURRED", nullable = false) private Instant occurredAt;

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
