package com.rhn.treatment.application;

import com.rhn.treatment.api.TreatmentRefundDirectory;
import com.rhn.treatment.domain.TreatmentExecutionItem;
import com.rhn.treatment.infrastructure.TreatmentExecutionItemRepository;
import com.rhn.treatment.infrastructure.TreatmentExecutionTaskRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class JpaTreatmentRefundDirectory implements TreatmentRefundDirectory {
    private final TreatmentExecutionItemRepository items;
    private final TreatmentExecutionTaskRepository tasks;

    public JpaTreatmentRefundDirectory(TreatmentExecutionItemRepository items,
                                       TreatmentExecutionTaskRepository tasks) {
        this.items = items;
        this.tasks = tasks;
    }

    @Override
    public RefundExecutionSnapshot refundExecution(Long tenantId, Long treatmentSourceId) {
        if (treatmentSourceId == null) return RefundExecutionSnapshot.unexecuted();
        return items.findByTenantIdAndSourceTypeAndSourceId(tenantId, "TREATMENT", treatmentSourceId)
                .map(TreatmentExecutionItem::taskId)
                .flatMap(tasks::findById)
                .map(task -> new RefundExecutionSnapshot(task.status()))
                .orElseGet(RefundExecutionSnapshot::unexecuted);
    }
}
