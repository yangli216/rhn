package com.rhn.diagnostics.infrastructure;

import com.rhn.diagnostics.domain.DiagnosticReportDraft;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import java.util.Optional;

public interface DiagnosticReportDraftRepository extends JpaRepository<DiagnosticReportDraft, Long> {
    Optional<DiagnosticReportDraft> findByTenantIdAndTaskId(Long tenantId, Long taskId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select draft from DiagnosticReportDraft draft where draft.tenantId = :tenantId and draft.taskId = :taskId")
    Optional<DiagnosticReportDraft> lockByTenantIdAndTaskId(Long tenantId, Long taskId);
}
