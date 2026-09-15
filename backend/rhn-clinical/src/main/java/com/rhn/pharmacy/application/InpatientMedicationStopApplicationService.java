package com.rhn.pharmacy.application;

import com.rhn.outpatient.api.MedicationRequestDirectory;
import com.rhn.pharmacy.api.InpatientMedicationStopDirectory;
import com.rhn.pharmacy.api.WardDeliveryDirectory;
import com.rhn.pharmacy.domain.DispenseTask;
import com.rhn.pharmacy.domain.DispenseTaskLine;
import com.rhn.pharmacy.domain.InventoryBalance;
import com.rhn.pharmacy.domain.InventoryReservation;
import com.rhn.pharmacy.domain.MedicationDispense;
import com.rhn.pharmacy.infrastructure.DispenseTaskLineRepository;
import com.rhn.pharmacy.infrastructure.DispenseTaskRepository;
import com.rhn.pharmacy.infrastructure.InventoryReservationRepository;
import com.rhn.pharmacy.infrastructure.MedicationDispenseConsumptionRepository;
import com.rhn.pharmacy.infrastructure.MedicationDispenseRepository;
import com.rhn.pharmacy.infrastructure.InpatientMedicationSupplyLineRepository;
import com.rhn.pharmacy.infrastructure.InpatientMedicationSupplyTaskRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Comparator;
import java.util.List;

import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class InpatientMedicationStopApplicationService implements InpatientMedicationStopDirectory {
    private final MedicationRequestDirectory requests;
    private final DispenseTaskLineRepository lines;
    private final DispenseTaskRepository tasks;
    private final InventoryReservationRepository reservations;
    private final InventoryAvailabilityService availability;
    private final MedicationDispenseConsumptionRepository consumptions;
    private final MedicationDispenseRepository dispenses;
    private final WardDeliveryDirectory wardDeliveries;
    private final InpatientMedicationSupplyLineRepository supplyLines;
    private final InpatientMedicationSupplyTaskRepository supplyTasks;

    public InpatientMedicationStopApplicationService(
            MedicationRequestDirectory requests,
            DispenseTaskLineRepository lines,
            DispenseTaskRepository tasks,
            InventoryReservationRepository reservations,
            InventoryAvailabilityService availability,
            MedicationDispenseConsumptionRepository consumptions,
            MedicationDispenseRepository dispenses,
            WardDeliveryDirectory wardDeliveries,
            InpatientMedicationSupplyLineRepository supplyLines,
            InpatientMedicationSupplyTaskRepository supplyTasks) {
        this.requests = requests;
        this.lines = lines;
        this.tasks = tasks;
        this.reservations = reservations;
        this.availability = availability;
        this.consumptions = consumptions;
        this.dispenses = dispenses;
        this.wardDeliveries = wardDeliveries;
        this.supplyLines = supplyLines;
        this.supplyTasks = supplyTasks;
    }

    @Override
    @Transactional
    public StopClosure freezeAfterOrderStop(StopCommand command) {
        cancelUnsubmittedSupply(command);
        List<DispenseTaskLine> requestLines = lines.findByTenantIdAndRequestIdOrderById(
                command.tenantId(), command.medicationRequestId());
        if (requestLines.isEmpty()) return cancelled(null, null);
        for (DispenseTaskLine line : requestLines) {
            DispenseTask task = tasks.lockByIdAndTenantId(line.taskId(), command.tenantId())
                    .orElseThrow(() -> notFound("DISPENSE_TASK_NOT_FOUND", "住院停嘱对应的药房任务不存在"));
            List<InventoryReservation> active = reservations.lockActiveByDispenseTaskLine(
                    command.tenantId(), line.id()).stream()
                    .sorted(Comparator.comparing(InventoryReservation::stockBinId)
                            .thenComparing(InventoryReservation::stockItemId)
                            .thenComparing(InventoryReservation::stockLotId))
                    .toList();
            for (InventoryReservation reservation : active) {
                InventoryBalance balance = availability.lockDimension(command.tenantId(), reservation.stockBinId(),
                                reservation.stockItemId(), reservation.stockLotId(), "AVAILABLE")
                        .orElseThrow(() -> conflict("INVENTORY_BALANCE_NOT_FOUND", "停嘱释放预留对应库存投影不存在"));
                BigDecimal releasable = reservation.releasableQuantity();
                if (releasable.signum() > 0) balance.release(releasable);
                reservation.release(command.actorId(), command.reason());
            }
            if (line.remainingQuantity().signum() > 0) {
                line.cancelRemainingForOrderStop();
                task.cancelRemainingForOrderStop();
            }
        }
        availability.flush();
        reservations.flush();
        lines.flush();
        tasks.flush();
        return stoppedClosure(command.tenantId(), requestLines);
    }

    private void cancelUnsubmittedSupply(StopCommand command) {
        var requestSupplyLines = supplyLines.findByTenantIdAndRequestIdOrderByCreatedAt(
                command.tenantId(), command.medicationRequestId());
        for (var line : requestSupplyLines) {
            if ("DRAFT".equals(line.status()) || "SUBMITTED".equals(line.status())) {
                line.cancel(line.revision(), command.reason(), command.actorId());
            }
        }
        for (var task : supplyTasks.findByTenantIdAndRequestIdAndStatusOrderByScheduledAt(
                command.tenantId(), command.medicationRequestId(), "ACTIVE")) {
            var line = requestSupplyLines.stream().filter(value -> value.id().equals(task.supplyLineId()))
                    .findFirst().orElse(null);
            if (line != null && "CANCELLED".equals(line.status())) {
                task.cancel(command.reason(), command.actorId());
            }
        }
        supplyTasks.flush();
        supplyLines.flush();
    }

    @Override
    @Transactional(readOnly = true)
    public StopClosure closure(Long tenantId, Long medicationRequestId) {
        var request = requests.requireForRouting(tenantId, medicationRequestId);
        if (!"CANCELLED".equals(request.status())) return StopClosure.notStopped(request.quantityUnit());
        List<DispenseTaskLine> requestLines = lines.findByTenantIdAndRequestIdOrderById(tenantId, medicationRequestId);
        if (requestLines.isEmpty()) return cancelled(null, request.quantityUnit());
        return stoppedClosure(tenantId, requestLines);
    }

    private StopClosure stoppedClosure(Long tenantId, List<DispenseTaskLine> requestLines) {
        DispenseTaskLine first = requestLines.getFirst();
        DispenseTask firstTask = tasks.findByIdAndTenantId(first.taskId(), tenantId)
                .orElseThrow(() -> notFound("DISPENSE_TASK_NOT_FOUND", "住院停嘱对应的药房任务不存在"));
        BigDecimal dispensed = BigDecimal.ZERO;
        BigDecimal returned = BigDecimal.ZERO;
        BigDecimal consumed = BigDecimal.ZERO;
        BigDecimal returnable = BigDecimal.ZERO;
        Delivery latest = new Delivery(null, null);
        for (DispenseTaskLine line : requestLines) {
            BigDecimal factor = line.baseQuantityFactor();
            BigDecimal lineDispensed = line.dispensedQuantity().multiply(factor);
            BigDecimal lineReturned = line.returnedQuantity().multiply(factor);
            BigDecimal lineConsumed = consumptions.consumedBaseQuantityForTaskLine(tenantId, line.id());
            dispensed = dispensed.add(lineDispensed);
            returned = returned.add(lineReturned);
            consumed = consumed.add(lineConsumed);
            returnable = returnable.add(lineDispensed.subtract(lineReturned).subtract(lineConsumed)
                    .max(BigDecimal.ZERO));
            Delivery candidate = latestDelivery(tenantId, line.taskId());
            if (candidate.id() != null) latest = candidate;
        }
        BigDecimal factor = first.baseQuantityFactor();
        if (dispensed.signum() == 0) return cancelled(firstTask, first.dispenseUnitCode());
        String status = returnable.signum() > 0 ? "RETURN_REQUIRED" : "STOPPED";
        String action = action(status, latest.status());
        return new StopClosure(status, firstTask.id(), firstTask.status(),
                operationQuantity(dispensed, factor), operationQuantity(consumed, factor),
                operationQuantity(returned, factor), operationQuantity(returnable, factor),
                first.dispenseUnitCode(), latest.id(), latest.status(), action);
    }

    private StopClosure stoppedClosure(Long tenantId, DispenseTask task, DispenseTaskLine line) {
        BigDecimal factor = line.baseQuantityFactor();
        BigDecimal dispensed = line.dispensedQuantity().multiply(factor);
        BigDecimal returned = line.returnedQuantity().multiply(factor);
        BigDecimal consumed = consumptions.consumedBaseQuantityForTaskLine(tenantId, line.id());
        BigDecimal returnable = dispensed.subtract(returned).subtract(consumed).max(BigDecimal.ZERO);
        if (dispensed.signum() == 0) return cancelled(task, line.dispenseUnitCode());

        Delivery delivery = latestDelivery(tenantId, task.id());
        String status = returnable.signum() > 0 ? "RETURN_REQUIRED" : "STOPPED";
        String action = action(status, delivery.status());
        return new StopClosure(status, task.id(), task.status(),
                line.dispensedQuantity(), operationQuantity(consumed, factor), line.returnedQuantity(),
                operationQuantity(returnable, factor), line.dispenseUnitCode(),
                delivery.id(), delivery.status(), action);
    }

    private StopClosure cancelled(DispenseTask task, String unitCode) {
        return new StopClosure("CANCELLED", task == null ? null : task.id(),
                task == null ? null : task.status(), BigDecimal.ZERO, BigDecimal.ZERO,
                BigDecimal.ZERO, BigDecimal.ZERO, unitCode, null, null, "AUTO_CANCELLED");
    }

    private BigDecimal operationQuantity(BigDecimal baseQuantity, BigDecimal factor) {
        return baseQuantity.divide(factor, 8, RoundingMode.HALF_UP).stripTrailingZeros();
    }

    private Delivery latestDelivery(Long tenantId, Long taskId) {
        MedicationDispense latest = dispenses.findByTenantIdAndTaskIdOrderByOccurredAtAscIdAsc(tenantId, taskId)
                .stream().filter(value -> "DISPENSE".equals(value.dispenseType())
                        || "REDISPENSE".equals(value.dispenseType()))
                .reduce((first, second) -> second).orElse(null);
        if (latest == null) return new Delivery(null, null);
        var gate = wardDeliveries.deliveryGate(tenantId, latest.id());
        return new Delivery(gate.deliveryId(), gate.status());
    }

    private String action(String status, String deliveryStatus) {
        if (!"RETURN_REQUIRED".equals(status)) return "NONE";
        if ("IN_TRANSIT".equals(deliveryStatus) || "DISCREPANCY".equals(deliveryStatus)) return "WAIT_RECEIPT";
        if ("RECEIVED".equals(deliveryStatus) || "RESOLVED".equals(deliveryStatus)) return "WARD_RETURN";
        return "PHARMACY_RETURN";
    }

    private record Delivery(Long id, String status) {}
}
