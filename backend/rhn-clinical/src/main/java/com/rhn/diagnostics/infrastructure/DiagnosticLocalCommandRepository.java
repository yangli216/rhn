package com.rhn.diagnostics.infrastructure;

import com.rhn.diagnostics.domain.DiagnosticLocalCommand;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface DiagnosticLocalCommandRepository extends JpaRepository<DiagnosticLocalCommand, Long> {
    Optional<DiagnosticLocalCommand> findByTenantIdAndTaskIdAndCommandId(Long tenantId, Long taskId, String commandId);
}
