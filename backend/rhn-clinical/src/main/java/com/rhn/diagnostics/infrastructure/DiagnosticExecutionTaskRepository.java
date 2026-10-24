package com.rhn.diagnostics.infrastructure;

import com.rhn.diagnostics.domain.DiagnosticExecutionTask;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;
import java.util.Collection;

public interface DiagnosticExecutionTaskRepository extends JpaRepository<DiagnosticExecutionTask, Long> {
    Optional<DiagnosticExecutionTask> findByIdAndTenantId(Long id, Long tenantId);
    Optional<DiagnosticExecutionTask> findByTenantIdAndRequestId(Long tenantId, Long requestId);
    List<DiagnosticExecutionTask> findByTenantIdAndRequestIdIn(Long tenantId, Collection<Long> requestIds);
    List<DiagnosticExecutionTask> findTop100ByTenantIdAndOrganizationIdAndDepartmentIdOrderByCreatedAtDesc(
            Long tenantId, Long organizationId, Long departmentId);
    @Query("""
            select task from DiagnosticExecutionTask task
            left join DiagnosticReport report on report.id = task.reportId
              and report.tenantId = task.tenantId and report.requestId = task.requestId
              and report.residentId = task.residentId and report.encounterId = task.encounterId
              and report.organizationId = task.organizationId and report.departmentId = task.departmentId
              and report.reportType = case when task.requestType = 'EXAMINATION' then 'IMAGING' else task.requestType end
              and report.status in ('FINAL', 'CORRECTED')
              and not exists (select newer.id from DiagnosticReport newer
                where newer.tenantId = task.tenantId and newer.requestId = task.requestId
                  and (newer.receivedAt > report.receivedAt or (newer.receivedAt = report.receivedAt and newer.id > report.id)))
            where task.tenantId = :tenantId and task.organizationId = :organizationId
              and task.departmentId = :departmentId and task.requestType = :requestType
              and (:encounterId is null or task.encounterId = :encounterId)
              and (:residentId is null or task.residentId = :residentId)
              and (:recentFrom is null or task.status not in ('COMPLETED', 'CANCELLED')
                or (task.status = 'COMPLETED' and report.id is null)
                or coalesce(task.completedAt, task.cancelledAt, task.createdAt) >= :recentFrom)
              and (:createdFrom is null or task.createdAt >= :createdFrom)
              and (:createdBefore is null or task.createdAt < :createdBefore)
              and (:status is null or (case when task.status = 'COMPLETED'
                and report.id is null then 'EXCEPTION' else cast(task.status as string) end) = :status)
              and (:keyword = '' or lower(task.itemNameSnapshot) like :keywordPattern escape '!'
                or lower(task.specimenNo) like :keywordPattern escape '!'
                or lower(task.requestNoSnapshot) like :keywordPattern escape '!'
                or lower(task.residentNameSnapshot) like :keywordPattern escape '!'
                or lower(task.healthRecordNoSnapshot) like :keywordPattern escape '!')
            """)
    org.springframework.data.domain.Page<DiagnosticExecutionTask> pageForWorkContext(
            Long tenantId, Long organizationId, Long departmentId, String requestType,
            String keyword, String keywordPattern, Long encounterId, Long residentId,
            String status, java.time.Instant recentFrom, java.time.Instant createdFrom,
            java.time.Instant createdBefore, org.springframework.data.domain.Pageable pageable);
    List<DiagnosticExecutionTask> findByTenantIdAndEncounterIdIn(Long tenantId, Collection<Long> encounterIds);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select task from DiagnosticExecutionTask task where task.id = :id and task.tenantId = :tenantId")
    Optional<DiagnosticExecutionTask> lockByIdAndTenantId(Long id, Long tenantId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select task from DiagnosticExecutionTask task where task.tenantId = :tenantId and task.requestId = :requestId")
    Optional<DiagnosticExecutionTask> lockByTenantIdAndRequestId(Long tenantId, Long requestId);
}
