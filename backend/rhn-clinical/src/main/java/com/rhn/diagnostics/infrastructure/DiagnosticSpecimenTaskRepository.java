package com.rhn.diagnostics.infrastructure;
import com.rhn.diagnostics.domain.DiagnosticSpecimenTask;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
public interface DiagnosticSpecimenTaskRepository extends JpaRepository<DiagnosticSpecimenTask,Long> {
    List<DiagnosticSpecimenTask> findByTenantIdAndSpecimenId(Long tenantId,Long specimenId);
}
