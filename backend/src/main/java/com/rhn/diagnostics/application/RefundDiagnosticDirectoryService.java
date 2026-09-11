package com.rhn.diagnostics.application;

import com.rhn.diagnostics.api.RefundDiagnosticDirectory;
import com.rhn.diagnostics.infrastructure.DiagnosticReportRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class RefundDiagnosticDirectoryService implements RefundDiagnosticDirectory {
    private final DiagnosticReportRepository reports;

    public RefundDiagnosticDirectoryService(DiagnosticReportRepository reports) {
        this.reports = reports;
    }

    @Override
    public boolean hasReportForRequest(Long tenantId, Long serviceRequestId) {
        return serviceRequestId != null
                && !reports.findByTenantIdAndRequestIdOrderByReportVersionDesc(tenantId, serviceRequestId).isEmpty();
    }
}
