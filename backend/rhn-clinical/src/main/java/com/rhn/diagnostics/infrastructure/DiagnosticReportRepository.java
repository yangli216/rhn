package com.rhn.diagnostics.infrastructure;

import com.rhn.diagnostics.domain.DiagnosticReport;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface DiagnosticReportRepository extends JpaRepository<DiagnosticReport, Long> {
    Optional<DiagnosticReport> findByIdAndTenantId(Long id, Long tenantId);
    Optional<DiagnosticReport> findTopByTenantIdAndEndpointCodeAndExternalReportIdOrderByReportVersionDesc(
            Long tenantId, String endpointCode, String externalReportId);
    List<DiagnosticReport> findByTenantIdAndEncounterIdOrderByIssuedAtDescReportVersionDesc(Long tenantId, Long encounterId);
    List<DiagnosticReport> findByTenantIdAndRequestIdOrderByReportVersionDesc(Long tenantId, Long requestId);
}
