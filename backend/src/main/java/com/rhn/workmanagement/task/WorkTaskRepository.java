package com.rhn.workmanagement.task;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

interface WorkTaskRepository extends JpaRepository<WorkTask, Long> {
    Optional<WorkTask> findByIdAndTenantId(Long id, Long tenantId);
    Optional<WorkTask> findByTenantIdAndSourceTypeAndSourceIdAndTaskType(
            Long tenantId, String sourceType, Long sourceId, String taskType);
    List<WorkTask> findByTenantIdAndSourceTypeAndSourceIdAndTaskTypeOrderByCreatedAtDesc(
            Long tenantId, String sourceType, Long sourceId, String taskType);
    Optional<WorkTask> findByTenantIdAndDedupKey(Long tenantId, String dedupKey);
    boolean existsByTenantIdAndDedupKey(Long tenantId, String dedupKey);

    @Query("""
            select task from WorkTask task
             where task.tenantId = :tenantId and task.status in :statuses
               and ((task.assigneeType = com.rhn.workmanagement.task.AssigneeType.USER and task.assigneeId = :userId)
                 or (task.assigneeType = com.rhn.workmanagement.task.AssigneeType.DEPARTMENT
                     and task.organizationId = :organizationId and task.departmentId = :departmentId))
             order by case task.priority
                 when com.rhn.workmanagement.task.TaskPriority.URGENT then 0
                 when com.rhn.workmanagement.task.TaskPriority.HIGH then 1
                 when com.rhn.workmanagement.task.TaskPriority.NORMAL then 2 else 3 end,
                 task.dueAt, task.createdAt desc
            """)
    List<WorkTask> findQueue(@Param("tenantId") Long tenantId, @Param("userId") Long userId,
                             @Param("organizationId") Long organizationId,
                             @Param("departmentId") Long departmentId,
                             @Param("statuses") Collection<TaskStatus> statuses);
}
