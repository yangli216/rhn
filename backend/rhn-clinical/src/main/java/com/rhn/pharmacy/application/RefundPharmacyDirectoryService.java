package com.rhn.pharmacy.application;

import com.rhn.pharmacy.api.RefundPharmacyDirectory;
import com.rhn.pharmacy.domain.DispenseTask;
import com.rhn.pharmacy.infrastructure.DispenseTaskLineRepository;
import com.rhn.pharmacy.infrastructure.DispenseTaskRepository;
import com.rhn.pharmacy.infrastructure.PharmacyFulfillmentAuthorizationRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class RefundPharmacyDirectoryService implements RefundPharmacyDirectory {
    private final DispenseTaskLineRepository taskLines;
    private final DispenseTaskRepository tasks;
    private final PharmacyFulfillmentAuthorizationRepository authorizations;

    public RefundPharmacyDirectoryService(DispenseTaskLineRepository taskLines,
                                          DispenseTaskRepository tasks,
                                          PharmacyFulfillmentAuthorizationRepository authorizations) {
        this.taskLines = taskLines;
        this.tasks = tasks;
        this.authorizations = authorizations;
    }

    @Override
    @Transactional(readOnly = true)
    public RefundFulfillmentStatus statusForRequest(Long tenantId, Long medicationRequestId) {
        if (medicationRequestId == null) return RefundFulfillmentStatus.undispensed("NOT_INTAKE");
        var lines = taskLines.findByTenantIdAndRequestIdOrderById(tenantId, medicationRequestId);
        if (lines.isEmpty()) return RefundFulfillmentStatus.undispensed("NOT_INTAKE");
        var task = tasks.findById(lines.get(0).taskId()).orElse(null);
        if (task == null) return RefundFulfillmentStatus.undispensed("NOT_INTAKE");
        String status = task.status();
        if ("COMPLETED".equals(status) || "PARTIALLY_DISPENSED".equals(status)) {
            return new RefundFulfillmentStatus("DISPENSED", status);
        }
        if ("RETURNED".equals(status) || "PARTIALLY_RETURNED".equals(status)) {
            return new RefundFulfillmentStatus("RETURNED", status);
        }
        return RefundFulfillmentStatus.undispensed(status);
    }

    @Override
    @Transactional
    public void cancelUnfulfilledForRefund(Long tenantId, Long medicationRequestId) {
        if (medicationRequestId == null) return;
        for (var line : taskLines.findByTenantIdAndRequestIdOrderById(tenantId, medicationRequestId)) {
            tasks.findById(line.taskId()).ifPresent(task -> cancelTaskIfNeeded(task));
        }
        authorizations.findTopByTenantIdAndMedicationRequestIdOrderByReadyAtDesc(tenantId, medicationRequestId)
                .ifPresent(auth -> {
                    auth.revoke(false, java.time.Instant.now());
                    authorizations.save(auth);
                });
    }

    private void cancelTaskIfNeeded(DispenseTask task) {
        if ("COMPLETED".equals(task.status()) || "CANCELLED".equals(task.status()) || "RETURNED".equals(task.status())) {
            return;
        }
        if ("PICKING".equals(task.status())) {
            task.releaseReservation();
        }
        task.cancelRemainingForOrderStop();
        tasks.save(task);
    }
}
