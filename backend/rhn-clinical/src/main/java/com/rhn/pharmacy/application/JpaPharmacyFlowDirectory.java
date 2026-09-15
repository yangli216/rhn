package com.rhn.pharmacy.application;

import com.rhn.outpatient.api.MedicationRequestDirectory;
import com.rhn.pharmacy.api.PharmacyFlowDirectory;
import com.rhn.pharmacy.domain.DispenseTask;
import com.rhn.pharmacy.domain.DispenseTaskLine;
import com.rhn.pharmacy.infrastructure.DispenseTaskLineRepository;
import com.rhn.pharmacy.infrastructure.DispenseTaskRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class JpaPharmacyFlowDirectory implements PharmacyFlowDirectory {
    private static final Set<String> IN_PROGRESS = Set.of(
            "PICKING", "READY_TO_DISPENSE", "PARTIALLY_DISPENSED");
    private static final Set<String> EXCEPTION = Set.of("INTERVENTION", "REJECTED");
    private static final Set<String> COMPLETED = Set.of("COMPLETED", "RETURNED", "PARTIALLY_RETURNED");

    private final MedicationRequestDirectory requests;
    private final DispenseTaskRepository tasks;
    private final DispenseTaskLineRepository lines;

    public JpaPharmacyFlowDirectory(MedicationRequestDirectory requests, DispenseTaskRepository tasks,
                                    DispenseTaskLineRepository lines) {
        this.requests = requests;
        this.tasks = tasks;
        this.lines = lines;
    }

    @Override
    @Transactional(readOnly = true)
    public Map<Long, PharmacyFlowSnapshot> summarize(Long tenantId, Long organizationId,
                                                      Collection<Long> encounterIds) {
        if (encounterIds == null || encounterIds.isEmpty()) return Map.of();
        Set<Long> encounterSet = Set.copyOf(encounterIds);
        List<MedicationRequestDirectory.MedicationRequestSnapshot> values = requests.activeForPharmacy(organizationId)
                .stream().filter(value -> encounterSet.contains(value.encounterId())).toList();
        if (values.isEmpty()) return Map.of();
        List<Long> requestIds = values.stream().map(MedicationRequestDirectory.MedicationRequestSnapshot::id).toList();
        Map<Long, List<Long>> taskIdsByRequest = new HashMap<>();
        lines.findByTenantIdAndRequestIdIn(tenantId, requestIds)
                .forEach(line -> taskIdsByRequest.computeIfAbsent(line.requestId(), ignored -> new ArrayList<>())
                        .add(line.taskId()));
        Map<Long, DispenseTask> tasksById = new HashMap<>();
        tasks.findAllById(taskIdsByRequest.values().stream().flatMap(Collection::stream).distinct().toList()).stream()
                .filter(task -> tenantId.equals(task.tenantId()))
                .forEach(task -> tasksById.put(task.id(), task));

        Map<Long, MutableSummary> grouped = new LinkedHashMap<>();
        for (MedicationRequestDirectory.MedicationRequestSnapshot request : values) {
            MutableSummary summary = grouped.computeIfAbsent(request.encounterId(), ignored -> new MutableSummary());
            List<String> statuses = taskIdsByRequest.getOrDefault(request.id(), List.of()).stream()
                    .map(tasksById::get).filter(java.util.Objects::nonNull).map(DispenseTask::status).toList();
            summary.add(statuses);
        }
        Map<Long, PharmacyFlowSnapshot> result = new LinkedHashMap<>();
        grouped.forEach((encounterId, value) -> result.put(encounterId, value.snapshot()));
        return Map.copyOf(result);
    }

    private static final class MutableSummary {
        private int total;
        private int waiting;
        private int inProgress;
        private int exception;
        private int completed;

        void add(List<String> statuses) {
            total++;
            if (statuses.stream().anyMatch(EXCEPTION::contains)) exception++;
            else if (statuses.stream().anyMatch(IN_PROGRESS::contains)) inProgress++;
            else if (!statuses.isEmpty() && statuses.stream().allMatch(COMPLETED::contains)) completed++;
            else waiting++;
        }

        PharmacyFlowSnapshot snapshot() {
            return new PharmacyFlowSnapshot(total, waiting, inProgress, exception, completed);
        }
    }
}
