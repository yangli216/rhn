package com.rhn.healthplanning.infrastructure;

import com.rhn.healthplanning.domain.CareTask;
import com.rhn.healthplanning.domain.CareTaskType;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface CareTaskRepository extends JpaRepository<CareTask, Long> {
    Optional<CareTask> findByTenantIdAndTaskCode(Long tenantId, String taskCode);
    List<CareTask> findByTenantIdAndResidentIdAndTaskTypeOrderByCreatedAtDesc(
            Long tenantId, Long residentId, CareTaskType taskType);
    List<CareTask> findByTenantIdAndTaskTypeOrderByDueAt(Long tenantId, CareTaskType taskType);
}
