package com.rhn.diagnostics.application;

import com.rhn.billing.api.RefundDiagnosticDirectory;
import com.rhn.diagnostics.infrastructure.DiagnosticReportRepository;
import com.rhn.diagnostics.infrastructure.DiagnosticExecutionTaskRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class RefundDiagnosticDirectoryService implements RefundDiagnosticDirectory {
    private final DiagnosticReportRepository reports;
    private final DiagnosticExecutionTaskRepository tasks;

    public RefundDiagnosticDirectoryService(DiagnosticReportRepository reports, DiagnosticExecutionTaskRepository tasks) {
        this.reports = reports;
        this.tasks = tasks;
    }

    @Override
    public boolean hasExecutionForRequest(Long tenantId, Long serviceRequestId) {
        return serviceRequestId != null && tasks.findByTenantIdAndRequestId(tenantId, serviceRequestId)
                .map(task -> task.collectedAt() != null || task.startedAt() != null).orElse(false);
    }

    @Override
    @Transactional
    public void requireUnexecutedForRefund(Long tenantId, java.util.Collection<Long> serviceRequestIds) {
        // Keep these task locks until the caller's refund transaction commits.
        if(serviceRequestIds.isEmpty()) return;
        var ordered = tasks.findByTenantIdAndRequestIdIn(tenantId,serviceRequestIds).stream()
                .sorted(java.util.Comparator.comparing(com.rhn.diagnostics.domain.DiagnosticExecutionTask::id)).toList();
        for(var value:ordered) {
            var task=tasks.lockByIdAndTenantId(value.id(),tenantId).orElseThrow();
            if(task.collectedAt()!=null || task.startedAt()!=null) blocked();
        }
        for (Long requestId : serviceRequestIds.stream().distinct().sorted().toList()) {
            if (hasReportForRequest(tenantId, requestId)) {
                blocked();
            }
        }
    }

    private void blocked() {
        throw com.rhn.shared.api.BusinessErrors.conflict("DIAGNOSTIC_REFUND_EXECUTION_BLOCKED",
                "医技申请已经采集、执行或出报告，不能直接退费");
    }

    @Override
    public boolean hasReportForRequest(Long tenantId, Long serviceRequestId) {
        return serviceRequestId != null
                && !reports.findByTenantIdAndRequestIdOrderByReportVersionDesc(tenantId, serviceRequestId).isEmpty();
    }
}
