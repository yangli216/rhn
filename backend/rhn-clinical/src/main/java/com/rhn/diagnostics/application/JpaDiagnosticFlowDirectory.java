package com.rhn.diagnostics.application;

import com.rhn.diagnostics.api.DiagnosticFlowDirectory;
import com.rhn.diagnostics.domain.DiagnosticExecutionTask;
import com.rhn.diagnostics.domain.DiagnosticReport;
import com.rhn.diagnostics.infrastructure.DiagnosticReportRepository;
import com.rhn.diagnostics.domain.DiagnosticExecutionTaskStatus;
import com.rhn.diagnostics.infrastructure.DiagnosticExecutionTaskRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.List;
import java.util.LinkedHashMap;
import java.util.Map;

@Service
public class JpaDiagnosticFlowDirectory implements DiagnosticFlowDirectory {
    private final DiagnosticExecutionTaskRepository tasks;
    private final DiagnosticReportRepository reports;

    public JpaDiagnosticFlowDirectory(DiagnosticExecutionTaskRepository tasks, DiagnosticReportRepository reports) {
        this.tasks = tasks; this.reports = reports;
    }

    @Override
    @Transactional(readOnly = true)
    public Map<Long, DiagnosticFlowSnapshot> summarize(Long tenantId, Collection<Long> encounterIds) {
        if (encounterIds == null || encounterIds.isEmpty()) return Map.of();
        Map<Long, MutableSummary> grouped = new LinkedHashMap<>();
        List<DiagnosticExecutionTask> values = tasks.findByTenantIdAndEncounterIdIn(tenantId, encounterIds);
        Map<Long, DiagnosticReport> latestReports = DiagnosticReportEvidence.latestCompletedReports(reports, tenantId, values);
        for (DiagnosticExecutionTask task : values) {
            if (task.status() == DiagnosticExecutionTaskStatus.CANCELLED) continue;
            DiagnosticExecutionTaskStatus status = DiagnosticReportEvidence.status(task, latestReports);
            grouped.computeIfAbsent(task.encounterId(), ignored -> new MutableSummary()).add(status);
        }
        Map<Long, DiagnosticFlowSnapshot> result = new LinkedHashMap<>();
        grouped.forEach((encounterId, value) -> result.put(encounterId, value.snapshot()));
        return Map.copyOf(result);
    }

    private static final class MutableSummary {
        private int total;
        private int blocked;
        private int waiting;
        private int inProgress;
        private int exception;
        private int completed;

        void add(DiagnosticExecutionTaskStatus status) {
            total++;
            switch (status) {
                case WAITING_SETTLEMENT -> blocked++;
                case READY, COLLECTED -> waiting++;
                case IN_PROGRESS -> inProgress++;
                case EXCEPTION -> exception++;
                case COMPLETED -> completed++;
                case CANCELLED -> throw new IllegalArgumentException("Cancelled tasks are excluded from execution totals");
            }
        }

        DiagnosticFlowSnapshot snapshot() {
            return new DiagnosticFlowSnapshot(total, blocked, waiting, inProgress, exception, completed);
        }
    }
}
