package com.rhn.inpatient.application;

import com.rhn.billing.api.InpatientBillingDirectory;
import com.rhn.inpatient.domain.InpatientCareRequest;
import com.rhn.inpatient.domain.InpatientOrderTask;
import org.springframework.stereotype.Service;

/** Posts one inpatient service charge for each completed execution fact.
 * Medication remains charged from the pharmacy dispense fact to avoid duplicate billing. */
@Service
public class InpatientOrderChargeService {
    private final InpatientBillingDirectory billing;

    public InpatientOrderChargeService(InpatientBillingDirectory billing) {
        this.billing = billing;
    }

    public void postExecutedTask(InpatientOrderTask task, InpatientCareRequest request) {
        if (!"EXECUTED".equals(task.status()) || "MEDICATION".equals(request.orderCategory())
                || request.catalogItemId() == null
                || request.unitPrice() == null || request.totalAmount() == null
                || request.currencyCode() == null) return;
        billing.postExecutedOrderTask(new InpatientBillingDirectory.ExecutedOrderChargeCommand(
                request.tenantId(), request.residentId(), request.encounterId(),
                request.performerOrganizationId(), request.performerDepartmentId(), request.id(), task.id(),
                task.occurrenceNo(), request.requestNo(), request.catalogItemId(), request.itemCodeSnapshot(),
                request.itemNameSnapshot(), request.unitCodeSnapshot(), request.unitPrice(), request.totalAmount(),
                request.currencyCode(), request.priceId(), request.priceRevision(), request.priceType(),
                task.completedAt(), task.completedBy(), request.orderCategory()));
    }
}
