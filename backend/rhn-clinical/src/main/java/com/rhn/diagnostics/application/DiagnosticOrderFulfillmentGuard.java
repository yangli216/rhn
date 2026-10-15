package com.rhn.diagnostics.application;

import com.rhn.diagnostics.domain.DiagnosticExecutionTaskStatus;
import com.rhn.diagnostics.infrastructure.DiagnosticExecutionTaskRepository;
import com.rhn.diagnostics.infrastructure.DiagnosticReportRepository;
import com.rhn.outpatient.api.OrderFulfillmentGuard;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Blocks cancelling a laboratory or examination request once the specimen is collected, executed or reported. */
@Component
class DiagnosticOrderFulfillmentGuard implements OrderFulfillmentGuard {
    private final DiagnosticExecutionTaskRepository tasks;
    private final DiagnosticReportRepository reports;

    DiagnosticOrderFulfillmentGuard(DiagnosticExecutionTaskRepository tasks, DiagnosticReportRepository reports) {
        this.tasks = tasks;
        this.reports = reports;
    }

    @Override
    @Transactional
    public String cancelBlockedReason(OrderRef order, boolean forUpdate) {
        if (!SERVICE_REQUEST.equals(order.sourceType())) return null;
        var task = forUpdate ? tasks.lockByTenantIdAndRequestId(order.tenantId(), order.requestId())
                : tasks.findByTenantIdAndRequestId(order.tenantId(), order.requestId());
        boolean started = task.map(value -> value.collectedAt() != null || value.startedAt() != null
                || value.status() != DiagnosticExecutionTaskStatus.WAITING_SETTLEMENT
                && value.status() != DiagnosticExecutionTaskStatus.READY
                && value.status() != DiagnosticExecutionTaskStatus.CANCELLED).orElse(false);
        if (started || !reports.findByTenantIdAndRequestIdOrderByReportVersionDesc(order.tenantId(), order.requestId()).isEmpty()) {
            return "检验检查申请已采集、执行或出具报告，不能撤销";
        }
        return null;
    }
}
