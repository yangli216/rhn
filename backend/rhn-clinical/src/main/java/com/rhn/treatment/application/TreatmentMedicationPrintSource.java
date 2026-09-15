package com.rhn.treatment.application;

import com.rhn.platform.printing.api.MedicationPrintSource;
import org.springframework.stereotype.Component;

import java.util.List;

/** Adapts the authorized treatment worklist to the printing platform's immutable input. */
@Component
public class TreatmentMedicationPrintSource implements MedicationPrintSource {
    private final TreatmentExecutionService treatments;

    public TreatmentMedicationPrintSource(TreatmentExecutionService treatments) {
        this.treatments = treatments;
    }

    @Override
    public List<TaskSnapshot> worklist(String taskType, String status, String keyword) {
        return treatments.worklist(taskType, status, keyword).stream()
                .map(task -> new TaskSnapshot(task.id(), task.revision(), task.taskNo(), task.status(),
                        task.residentId(), task.residentName(), task.healthRecordNo(), task.encounterId(),
                        task.sourceGroupId(), task.createdAt(), task.startedAt(), task.completedAt(),
                        task.executionSite(), task.items().stream()
                                .map(item -> new ItemSnapshot(item.itemName(), item.doseValue(), item.doseUnit(),
                                        item.routeCode(), item.frequencyCode(), item.frequencyName(),
                                        item.skinTestRequired(), item.cancelled())).toList()))
                .toList();
    }
}
