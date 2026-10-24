package com.rhn.treatment.infrastructure;

import com.rhn.treatment.domain.TreatmentExecutionTask;
import com.rhn.treatment.domain.TreatmentExecutionTaskStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Collection;

public interface TreatmentExecutionTaskRepository extends JpaRepository<TreatmentExecutionTask, Long> {
    Optional<TreatmentExecutionTask> findByTenantIdAndTaskTypeAndSourceGroupId(
            Long tenantId, String taskType, Long sourceGroupId);

    /** 队列窗口一：全部非终态任务，调用方以 Pageable 限制安全上限。 */
    @Query("select t from TreatmentExecutionTask t where t.tenantId=:tenantId and t.organizationId=:organizationId "
            + "and t.departmentId=:departmentId and t.status in :statuses order by t.createdAt desc, t.id desc")
    List<TreatmentExecutionTask> findByScopeAndStatuses(Long tenantId, Long organizationId, Long departmentId,
                                                         Collection<TreatmentExecutionTaskStatus> statuses,
                                                         Pageable pageable);

    /** 队列窗口二：当日（业务时区）完成或处置的终态任务，按完成/处置时间倒序。 */
    @Query("select t from TreatmentExecutionTask t where t.tenantId=:tenantId and t.organizationId=:organizationId "
            + "and t.departmentId=:departmentId and t.status in :statuses "
            + "and t.completedAt >= :from and t.completedAt < :to order by t.completedAt desc, t.id desc")
    List<TreatmentExecutionTask> findFinishedBetween(Long tenantId, Long organizationId, Long departmentId,
                                                      Collection<TreatmentExecutionTaskStatus> statuses,
                                                      Instant from, Instant to, Pageable pageable);

    List<TreatmentExecutionTask> findByTenantIdAndEncounterIdIn(Long tenantId, Collection<Long> encounterIds);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from TreatmentExecutionTask t where t.id=:id and t.tenantId=:tenantId")
    Optional<TreatmentExecutionTask> lockByIdAndTenantId(Long id, Long tenantId);
}
