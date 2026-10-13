package com.rhn.diagnostics.infrastructure;

import com.rhn.diagnostics.domain.DiagnosticReportImage;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface DiagnosticReportImageRepository extends JpaRepository<DiagnosticReportImage, Long> {
    List<DiagnosticReportImage> findByTenantIdAndReportIdOrderBySortOrder(Long tenantId, Long reportId);
}
