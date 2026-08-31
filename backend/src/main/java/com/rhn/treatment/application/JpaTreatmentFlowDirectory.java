package com.rhn.treatment.application;

import com.rhn.treatment.api.TreatmentFlowDirectory;
import com.rhn.treatment.domain.TreatmentExecutionTask;
import com.rhn.treatment.infrastructure.TreatmentExecutionTaskRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Map;

@Service
public class JpaTreatmentFlowDirectory implements TreatmentFlowDirectory {
    private final TreatmentExecutionTaskRepository tasks;

    public JpaTreatmentFlowDirectory(TreatmentExecutionTaskRepository tasks) {
        this.tasks = tasks;
    }

    @Override
    @Transactional(readOnly = true)
    public Map<Long, TreatmentFlowSnapshot> summarize(Long tenantId, Collection<Long> encounterIds) {
        if (encounterIds == null || encounterIds.isEmpty()) return Map.of();
        Map<Long, MutableSummary> grouped = new LinkedHashMap<>();
        for (TreatmentExecutionTask task : tasks.findByTenantIdAndEncounterIdIn(tenantId, encounterIds)) {
            grouped.computeIfAbsent(task.encounterId(), ignored -> new MutableSummary()).add(task.status());
        }
        Map<Long, TreatmentFlowSnapshot> result = new LinkedHashMap<>();
        grouped.forEach((encounterId, value) -> result.put(encounterId, value.snapshot()));
        return Map.copyOf(result);
    }

    private static final class MutableSummary {
        private int total;
        private int settlementBlocked;
        private int dispenseBlocked;
        private int waiting;
        private int inProgress;
        private int exception;
        private int completed;

        void add(String status) {
            total++;
            switch (status) {
                case "WAITING_SETTLEMENT" -> settlementBlocked++;
                case "WAITING_DISPENSE" -> dispenseBlocked++;
                case "READY" -> waiting++;
                case "IN_PROGRESS" -> inProgress++;
                case "EXCEPTION" -> exception++;
                default -> completed++;
            }
        }

        TreatmentFlowSnapshot snapshot() {
            return new TreatmentFlowSnapshot(total, settlementBlocked, dispenseBlocked, waiting,
                    inProgress, exception, completed);
        }
    }
}
