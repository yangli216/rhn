package com.rhn.pharmacy.application;

import com.rhn.outpatient.api.MedicationRequestDirectory;
import com.rhn.outpatient.api.MedicationRequestDirectory.MedicationRequestSnapshot;
import com.rhn.pharmacy.api.PharmacyFlowDirectory;
import com.rhn.pharmacy.domain.DispenseTask;
import com.rhn.pharmacy.domain.DispenseTaskLine;
import com.rhn.pharmacy.domain.DispenseTaskLineStatus;
import com.rhn.pharmacy.infrastructure.DispenseTaskLineRepository;
import com.rhn.pharmacy.infrastructure.DispenseTaskRepository;
import com.rhn.pharmacy.infrastructure.MedicationDispenseLineRepository;
import com.rhn.pharmacy.infrastructure.MedicationDispenseLineRepository.TaskLineQuantities;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class JpaPharmacyFlowDirectory implements PharmacyFlowDirectory {
    private final MedicationRequestDirectory requests;
    private final DispenseTaskRepository tasks;
    private final DispenseTaskLineRepository lines;
    private final MedicationDispenseLineRepository dispenseLines;

    public JpaPharmacyFlowDirectory(MedicationRequestDirectory requests, DispenseTaskRepository tasks,
                                    DispenseTaskLineRepository lines, MedicationDispenseLineRepository dispenseLines) {
        this.requests = requests; this.tasks = tasks; this.lines = lines; this.dispenseLines = dispenseLines;
    }

    @Override
    @Transactional(readOnly = true)
    public Map<Long, PharmacyFlowSnapshot> summarize(Long tenantId, Long organizationId, Collection<Long> encounterIds) {
        if (encounterIds == null || encounterIds.isEmpty()) return Map.of();
        Set<Long> encounterSet = Set.copyOf(encounterIds);
        List<MedicationRequestSnapshot> values = requests.activeForPharmacy(organizationId).stream()
                .filter(value -> tenantId.equals(value.tenantId()) && encounterSet.contains(value.encounterId())).toList();
        if (values.isEmpty()) return Map.of();
        List<Long> requestIds = values.stream().map(MedicationRequestSnapshot::id).toList();
        List<DispenseTaskLine> taskLines = lines.findByTenantIdAndRequestIdIn(tenantId, requestIds);
        Map<Long, List<DispenseTaskLine>> linesByRequest = new HashMap<>();
        taskLines.forEach(line -> linesByRequest.computeIfAbsent(line.requestId(), ignored -> new ArrayList<>()).add(line));
        Map<Long, DispenseTask> tasksById = new HashMap<>();
        tasks.findAllById(taskLines.stream().map(DispenseTaskLine::taskId).distinct().toList()).stream()
                .filter(task -> tenantId.equals(task.tenantId())).forEach(task -> tasksById.put(task.id(), task));
        Map<Long, TaskLineQuantities> quantities = new HashMap<>();
        if (!taskLines.isEmpty()) {
            dispenseLines.flowQuantities(tenantId, taskLines.stream().map(DispenseTaskLine::id).toList())
                    .forEach(value -> quantities.put(value.getTaskLineId(), value));
        }
        Map<Long, MutableSummary> grouped = new LinkedHashMap<>();
        for (MedicationRequestSnapshot request : values) {
            List<LineState> states = linesByRequest.getOrDefault(request.id(), List.of()).stream()
                    .map(line -> state(request, line, tasksById.get(line.taskId()), quantities.get(line.id()))).toList();
            grouped.computeIfAbsent(request.encounterId(), ignored -> new MutableSummary()).add(states);
        }
        Map<Long, PharmacyFlowSnapshot> result = new LinkedHashMap<>();
        grouped.forEach((encounterId, value) -> result.put(encounterId, value.snapshot()));
        return Map.copyOf(result);
    }

    private LineState state(MedicationRequestSnapshot request, DispenseTaskLine line, DispenseTask task,
                            TaskLineQuantities evidence) {
        if (task == null || !request.residentId().equals(task.residentId())
                || !request.encounterId().equals(task.encounterId())) return LineState.EXCEPTION;
        // No persisted movement rows means an actual zero movement, never an assumed successful issue.
        BigDecimal issued = evidence == null ? BigDecimal.ZERO : evidence.getIssuedQuantity();
        BigDecimal returned = evidence == null ? BigDecimal.ZERO : evidence.getReturnedQuantity();
        if (issued == null || returned == null || issued.signum() < 0 || returned.signum() < 0
                || returned.compareTo(issued) > 0 || issued.compareTo(line.plannedQuantity()) > 0
                || issued.compareTo(line.dispensedQuantity()) != 0 || returned.compareTo(line.returnedQuantity()) != 0) {
            return LineState.EXCEPTION;
        }
        return switch (task.status()) {
            case INTERVENTION, REJECTED, CANCELLED -> LineState.EXCEPTION;
            case PICKING, READY_TO_DISPENSE, PARTIALLY_DISPENSED -> LineState.IN_PROGRESS;
            case PENDING_REVIEW, READY_TO_PICK -> LineState.WAITING;
            case COMPLETED -> issued.signum() > 0 && issued.compareTo(line.plannedQuantity()) == 0
                    && returned.signum() == 0 && line.status() == DispenseTaskLineStatus.COMPLETED
                    ? LineState.COMPLETED : LineState.EXCEPTION;
            case RETURNED -> issued.signum() > 0 && issued.compareTo(line.plannedQuantity()) == 0
                    && returned.compareTo(issued) == 0 && line.status() == DispenseTaskLineStatus.RETURNED
                    ? LineState.RETURNED : LineState.EXCEPTION;
            case PARTIALLY_RETURNED -> issued.signum() > 0 && issued.compareTo(line.plannedQuantity()) == 0
                    && returned.signum() > 0 && returned.compareTo(issued) < 0 && line.status() == DispenseTaskLineStatus.PARTIAL
                    ? LineState.PARTIALLY_RETURNED : LineState.EXCEPTION;
        };
    }

    private enum LineState { WAITING, IN_PROGRESS, EXCEPTION, COMPLETED, RETURNED, PARTIALLY_RETURNED }

    private static final class MutableSummary {
        private int total, waiting, inProgress, exception, completed, returned, partiallyReturned;

        void add(List<LineState> states) {
            total++;
            if (states.contains(LineState.EXCEPTION)) exception++;
            else if (states.contains(LineState.IN_PROGRESS)) inProgress++;
            else if (states.isEmpty() || states.contains(LineState.WAITING)) waiting++;
            else if (states.stream().allMatch(value -> value == LineState.COMPLETED)) completed++;
            else if (states.stream().allMatch(value -> value == LineState.RETURNED)) returned++;
            else partiallyReturned++;
        }

        PharmacyFlowSnapshot snapshot() {
            return new PharmacyFlowSnapshot(total, waiting, inProgress, exception, completed, returned, partiallyReturned);
        }
    }
}
