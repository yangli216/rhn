package com.rhn.workmanagement.task;

import java.time.Instant;

public record TaskResponse(
        Long id,
        String taskType,
        String title,
        String summary,
        String priority,
        String status,
        String assigneeType,
        Long residentId,
        Long encounterId,
        String routePath,
        Instant dueAt,
        Long claimedBy,
        Instant claimedAt,
        Instant completedAt,
        Instant createdAt,
        long revision
) {
    static TaskResponse from(WorkTask task) {
        return new TaskResponse(task.id(), task.taskType(), task.title(), task.summary(), task.priority().name(),
                task.status().name(), task.assigneeType().name(), task.residentId(), task.encounterId(),
                task.routePath(), task.dueAt(), task.claimedBy(), task.claimedAt(), task.completedAt(),
                task.createdAt(), task.revision());
    }
}
