package com.rhn.treatment.infrastructure;

import com.rhn.treatment.domain.TreatmentExecutionTask;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;
import java.util.Collection;

public interface TreatmentExecutionTaskRepository extends JpaRepository<TreatmentExecutionTask, Long> {
    Optional<TreatmentExecutionTask> findByTenantIdAndTaskTypeAndSourceGroupId(
            Long tenantId, String taskType, Long sourceGroupId);

    List<TreatmentExecutionTask> findTop100ByTenantIdAndOrganizationIdAndDepartmentIdOrderByCreatedAtDesc(
            Long tenantId, Long organizationId, Long departmentId);
    List<TreatmentExecutionTask> findByTenantIdAndEncounterIdIn(Long tenantId, Collection<Long> encounterIds);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from TreatmentExecutionTask t where t.id=:id and t.tenantId=:tenantId")
    Optional<TreatmentExecutionTask> lockByIdAndTenantId(Long id, Long tenantId);
}
