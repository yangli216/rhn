package com.rhn.diagnostics.application;

import com.rhn.diagnostics.api.DiagnosticFlowDirectory;
import com.rhn.diagnostics.domain.DiagnosticExecutionTask;
import com.rhn.diagnostics.infrastructure.DiagnosticExecutionTaskRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Map;

@Service
public class JpaDiagnosticFlowDirectory implements DiagnosticFlowDirectory {
    private final DiagnosticExecutionTaskRepository tasks;

    public JpaDiagnosticFlowDirectory(DiagnosticExecutionTaskRepository tasks) {
        this.tasks = tasks;
    }

    @Override
    @Transactional(readOnly = true)
    public Map<Long, DiagnosticFlowSnapshot> summarize(Long tenantId, Collection<Long> encounterIds) {
        if (encounterIds == null || encounterIds.isEmpty()) return Map.of();
        Map<Long, MutableSummary> grouped = new LinkedHashMap<>();
        for (DiagnosticExecutionTask task : tasks.findByTenantIdAndEncounterIdIn(tenantId, encounterIds)) {
            grouped.computeIfAbsent(task.encounterId(), ignored -> new MutableSummary()).add(task.status());
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

        void add(String status) {
            total++;
            switch (status) {
                case "WAITING_SETTLEMENT" -> blocked++;
                case "READY", "COLLECTED" -> waiting++;
                case "IN_PROGRESS" -> inProgress++;
                case "EXCEPTION" -> exception++;
                default -> completed++;
            }
        }

        DiagnosticFlowSnapshot snapshot() {
            return new DiagnosticFlowSnapshot(total, blocked, waiting, inProgress, exception, completed);
        }
    }
}
