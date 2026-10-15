package com.rhn.treatment.application;

import com.rhn.outpatient.api.OrderFulfillmentGuard;
import com.rhn.treatment.domain.TreatmentExecutionItem;
import com.rhn.treatment.domain.TreatmentExecutionTaskStatus;
import com.rhn.treatment.infrastructure.TreatmentExecutionItemRepository;
import com.rhn.treatment.infrastructure.TreatmentExecutionTaskRepository;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Blocks cancelling a treatment or injection order once its execution has started or finished. */
@Component
class TreatmentOrderFulfillmentGuard implements OrderFulfillmentGuard {
    private final TreatmentExecutionItemRepository items;
    private final TreatmentExecutionTaskRepository tasks;

    TreatmentOrderFulfillmentGuard(TreatmentExecutionItemRepository items, TreatmentExecutionTaskRepository tasks) {
        this.items = items;
        this.tasks = tasks;
    }

    @Override
    @Transactional
    public String cancelBlockedReason(OrderRef order, boolean forUpdate) {
        var item = forUpdate ? items.lockBySource(order.tenantId(), order.sourceType(), order.requestId())
                : items.findByTenantIdAndSourceTypeAndSourceId(order.tenantId(), order.sourceType(), order.requestId());
        boolean started = item.filter(value -> !value.cancelled()).map(TreatmentExecutionItem::taskId)
                .flatMap(tasks::findById)
                .map(task -> task.status() == TreatmentExecutionTaskStatus.IN_PROGRESS
                        || task.status() == TreatmentExecutionTaskStatus.COMPLETED).orElse(false);
        return started ? "治疗或用药执行已开始或已完成，不能撤销" : null;
    }
}
