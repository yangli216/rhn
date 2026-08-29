package com.rhn.diagnostics.infrastructure;

import com.rhn.diagnostics.domain.DiagnosticReportResult;
import com.rhn.diagnostics.domain.DiagnosticReportResultId;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface DiagnosticReportResultRepository extends JpaRepository<DiagnosticReportResult, DiagnosticReportResultId> {
    List<DiagnosticReportResult> findByTenantIdAndReportIdOrderBySortOrder(Long tenantId, Long reportId);
}
