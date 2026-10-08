package com.rhn.diagnostics.application;

import com.rhn.diagnostics.domain.DiagnosticExecutionTask;
import com.rhn.diagnostics.domain.DiagnosticExecutionTaskStatus;
import com.rhn.diagnostics.domain.DiagnosticReport;
import com.rhn.diagnostics.infrastructure.DiagnosticReportRepository;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Read-side verification also protects historical task flags that predate report-backed projection. */
final class DiagnosticReportEvidence {
    private DiagnosticReportEvidence() {}

    static Map<Long, DiagnosticReport> latestCompletedReports(DiagnosticReportRepository reports, Long tenantId,
                                                             Collection<DiagnosticExecutionTask> tasks) {
        List<Long> requests = tasks.stream().filter(task -> task.status() == DiagnosticExecutionTaskStatus.COMPLETED)
                .map(DiagnosticExecutionTask::requestId).distinct().toList();
        Map<Long, DiagnosticReport> latest = new LinkedHashMap<>();
        if (!requests.isEmpty()) {
            reports.findByTenantIdAndRequestIdInOrderByReceivedAtDescIdDesc(tenantId, requests)
                    .forEach(report -> latest.putIfAbsent(report.requestId(), report));
        }
        return latest;
    }

    static DiagnosticExecutionTaskStatus status(DiagnosticExecutionTask task, Map<Long, DiagnosticReport> latest) {
        return task.status() == DiagnosticExecutionTaskStatus.COMPLETED && !task.hasCompletedReport(latest.get(task.requestId()))
                ? DiagnosticExecutionTaskStatus.EXCEPTION : task.status();
    }
}
