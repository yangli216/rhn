package com.rhn.pharmacy.application;

import com.rhn.pharmacy.api.PharmacyRefundDirectory;
import com.rhn.pharmacy.infrastructure.DispenseTaskLineRepository;
import com.rhn.pharmacy.infrastructure.DispenseTaskRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class JpaPharmacyRefundDirectory implements PharmacyRefundDirectory {
    private final DispenseTaskLineRepository taskLines;
    private final DispenseTaskRepository tasks;

    public JpaPharmacyRefundDirectory(DispenseTaskLineRepository taskLines,
                                      DispenseTaskRepository tasks) {
        this.taskLines = taskLines;
        this.tasks = tasks;
    }

    @Override
    public RefundFulfillmentSnapshot refundFulfillment(Long tenantId, Long medicationRequestId) {
        if (medicationRequestId == null) return RefundFulfillmentSnapshot.notIntake();
        return taskLines.findByTenantIdAndRequestIdOrderById(tenantId, medicationRequestId).stream()
                .findFirst()
                .flatMap(line -> tasks.findById(line.taskId()))
                .map(task -> new RefundFulfillmentSnapshot(task.status()))
                .orElseGet(RefundFulfillmentSnapshot::notIntake);
    }
}
