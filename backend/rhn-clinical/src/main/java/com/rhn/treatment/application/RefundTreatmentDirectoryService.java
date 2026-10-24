package com.rhn.treatment.application;

import com.rhn.billing.api.RefundTreatmentDirectory;
import com.rhn.treatment.domain.TreatmentExecutionItem;
import com.rhn.treatment.domain.TreatmentExecutionTask;
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

    /** 与撤销医嘱保护同一口径：执行项未取消，且任务曾开始执行（含执行后异常、已处置、重新执行前）。 */
    @Override
    public boolean isExecutedOrInProgress(Long tenantId, String sourceType, Long sourceId) {
        if (tenantId == null || sourceType == null || sourceId == null) return false;
        return treatmentItems.findByTenantIdAndSourceTypeAndSourceId(tenantId, sourceType, sourceId)
                .filter(item -> !item.cancelled())
                .map(TreatmentExecutionItem::taskId)
                .flatMap(treatmentTasks::findById)
                .map(TreatmentExecutionTask::hasStarted)
                .orElse(false);
    }
}
