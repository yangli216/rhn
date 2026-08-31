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
    List<DiagnosticExecutionTask> findTop100ByTenantIdAndOrganizationIdAndDepartmentIdOrderByCreatedAtDesc(
            Long tenantId, Long organizationId, Long departmentId);
    List<DiagnosticExecutionTask> findByTenantIdAndEncounterIdIn(Long tenantId, Collection<Long> encounterIds);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select task from DiagnosticExecutionTask task where task.id = :id and task.tenantId = :tenantId")
    Optional<DiagnosticExecutionTask> lockByIdAndTenantId(Long id, Long tenantId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select task from DiagnosticExecutionTask task where task.tenantId = :tenantId and task.requestId = :requestId")
    Optional<DiagnosticExecutionTask> lockByTenantIdAndRequestId(Long tenantId, Long requestId);
}
