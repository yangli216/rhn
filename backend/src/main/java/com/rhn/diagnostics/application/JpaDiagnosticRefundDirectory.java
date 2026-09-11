package com.rhn.diagnostics.application;

import com.rhn.diagnostics.api.DiagnosticRefundDirectory;
import com.rhn.diagnostics.infrastructure.DiagnosticReportRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class JpaDiagnosticRefundDirectory implements DiagnosticRefundDirectory {
    private final DiagnosticReportRepository reports;

    public JpaDiagnosticRefundDirectory(DiagnosticReportRepository reports) {
        this.reports = reports;
    }

    @Override
    public RefundExecutionSnapshot refundExecution(Long tenantId, Long serviceRequestId) {
        if (serviceRequestId == null) return RefundExecutionSnapshot.unexecuted();
        boolean reportIssued = !reports.findByTenantIdAndRequestIdOrderByReportVersionDesc(
                tenantId, serviceRequestId).isEmpty();
        return new RefundExecutionSnapshot(reportIssued);
    }
}
