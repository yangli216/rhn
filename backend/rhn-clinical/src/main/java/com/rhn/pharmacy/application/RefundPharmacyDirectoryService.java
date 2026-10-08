package com.rhn.pharmacy.application;

import com.rhn.pharmacy.api.RefundPharmacyDirectory;
import com.rhn.pharmacy.domain.DispenseTask;
import com.rhn.pharmacy.domain.DispenseTaskStatus;
import com.rhn.pharmacy.domain.InventoryReservation;
import com.rhn.pharmacy.infrastructure.DispenseTaskLineRepository;
import com.rhn.pharmacy.infrastructure.DispenseTaskRepository;
import com.rhn.pharmacy.infrastructure.InventoryReservationRepository;
import com.rhn.pharmacy.infrastructure.PharmacyFulfillmentAuthorizationRepository;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;

import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.forbidden;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class RefundPharmacyDirectoryService implements RefundPharmacyDirectory {
    private final DispenseTaskLineRepository taskLines;
    private final DispenseTaskRepository tasks;
    private final PharmacyFulfillmentAuthorizationRepository authorizations;
    private final InventoryReservationRepository reservations;
    private final InventoryAvailabilityService availability;
    private final ExecutionContextProvider contextProvider;

    public RefundPharmacyDirectoryService(DispenseTaskLineRepository taskLines,
                                          DispenseTaskRepository tasks,
                                          PharmacyFulfillmentAuthorizationRepository authorizations,
                                          InventoryReservationRepository reservations,
                                          InventoryAvailabilityService availability,
                                          ExecutionContextProvider contextProvider) {
        this.taskLines = taskLines;
        this.tasks = tasks;
        this.authorizations = authorizations;
        this.reservations = reservations;
        this.availability = availability;
        this.contextProvider = contextProvider;
    }

    @Override
    @Transactional(readOnly = true)
    public RefundFulfillmentStatus statusForRequest(Long tenantId, Long medicationRequestId) {
        if (medicationRequestId == null) return RefundFulfillmentStatus.undispensed("NOT_INTAKE");
        var lines = taskLines.findByTenantIdAndRequestIdOrderById(tenantId, medicationRequestId);
        if (lines.isEmpty()) return RefundFulfillmentStatus.undispensed("NOT_INTAKE");
        var task = tasks.findById(lines.get(0).taskId()).orElse(null);
        if (task == null) return RefundFulfillmentStatus.undispensed("NOT_INTAKE");
        String status = task.status().name();
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
        var context = contextProvider.requireCurrent();
        if (!tenantId.equals(context.tenantId())) throw forbidden("REFUND_TENANT_MISMATCH", "退费租户不匹配");
        for (Long taskId : taskLines.findTaskIdsForRequest(tenantId, medicationRequestId)) {
            DispenseTask task = tasks.lockByIdAndTenantId(taskId, tenantId)
                    .orElseThrow(() -> notFound("DISPENSE_TASK_NOT_FOUND", "退费对应发药任务不存在"));
            if (task.status() == DispenseTaskStatus.COMPLETED || task.status() == DispenseTaskStatus.RETURNED) continue;
            for (var line : taskLines.findByTenantIdAndTaskIdOrderById(tenantId, taskId)) {
                var active = reservations.lockActiveByDispenseTaskLine(tenantId, line.id()).stream()
                        .sorted(Comparator.comparing(InventoryReservation::stockBinId)
                                .thenComparing(InventoryReservation::stockItemId)
                                .thenComparing(InventoryReservation::stockLotId)).toList();
                for (var reservation : active) {
                    var balance = availability.lockDimension(tenantId, reservation.stockBinId(),
                                    reservation.stockItemId(), reservation.stockLotId(), "AVAILABLE")
                            .orElseThrow(() -> conflict("INVENTORY_BALANCE_NOT_FOUND", "退费释放预留对应库存投影不存在"));
                    var releasable = reservation.releasableQuantity();
                    if (releasable.signum() > 0) balance.release(releasable);
                    reservation.release(context.subjectId(), "门诊退费取消未发药任务");
                }
                line.cancelRemainingForOrderStop();
            }
            task.cancelRemainingForOrderStop();
        }
        authorizations.findTopByTenantIdAndMedicationRequestIdOrderByReadyAtDesc(tenantId, medicationRequestId)
                .ifPresent(auth -> {
                    auth.revoke(false, java.time.Instant.now());
                    authorizations.save(auth);
                });
        availability.flush();
        reservations.flush();
        taskLines.flush();
        tasks.flush();
    }
}
