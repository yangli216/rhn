package com.rhn.treatment.application;

import com.rhn.treatment.api.RefundTreatmentDirectory;
import com.rhn.treatment.domain.TreatmentExecutionItem;
import com.rhn.treatment.infrastructure.TreatmentExecutionItemRepository;
import com.rhn.treatment.infrastructure.TreatmentExecutionTaskRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class RefundTreatmentDirectoryService implements RefundTreatmentDirectory {
    private final TreatmentExecutionItemRepository treatmentItems;
    private final TreatmentExecutionTaskRepository treatmentTasks;

    public RefundTreatmentDirectoryService(TreatmentExecutionItemRepository treatmentItems,
                                           TreatmentExecutionTaskRepository treatmentTasks) {
        this.treatmentItems = treatmentItems;
        this.treatmentTasks = treatmentTasks;
    }

    @Override
    public boolean isExecutedOrInProgress(Long tenantId, Long treatmentSourceId) {
        if (treatmentSourceId == null) return false;
        return treatmentItems.findByTenantIdAndSourceTypeAndSourceId(tenantId, "TREATMENT", treatmentSourceId)
                .map(TreatmentExecutionItem::taskId)
                .flatMap(treatmentTasks::findById)
                .map(task -> "COMPLETED".equals(task.status()) || "IN_PROGRESS".equals(task.status()))
                .orElse(false);
    }
}
