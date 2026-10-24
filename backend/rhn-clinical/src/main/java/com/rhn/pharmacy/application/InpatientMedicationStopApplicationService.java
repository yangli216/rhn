package com.rhn.pharmacy.application;

import com.rhn.outpatient.api.MedicationRequestDirectory;
import com.rhn.pharmacy.api.InpatientMedicationStopDirectory;
import com.rhn.pharmacy.api.WardDeliveryDirectory;
import com.rhn.pharmacy.domain.DispenseTask;
import com.rhn.pharmacy.domain.DispenseTaskLine;
import com.rhn.pharmacy.domain.InpatientMedicationSupplyLineStatus;
import com.rhn.pharmacy.domain.InpatientMedicationSupplyTaskStatus;
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
import java.util.Map;

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
            if (line.status() == InpatientMedicationSupplyLineStatus.DRAFT || line.status() == InpatientMedicationSupplyLineStatus.SUBMITTED) {
                line.cancel(line.revision(), command.reason(), command.actorId());
            }
        }
        for (var task : supplyTasks.findByTenantIdAndRequestIdAndStatusOrderByScheduledAt(
                command.tenantId(), command.medicationRequestId(), InpatientMedicationSupplyTaskStatus.ACTIVE)) {
            var line = requestSupplyLines.stream().filter(value -> value.id().equals(task.supplyLineId()))
                    .findFirst().orElse(null);
            if (line != null && line.status() == InpatientMedicationSupplyLineStatus.CANCELLED) {
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
        return stoppedClosure(requestLines, firstTask, consumedQuantities(tenantId, requestLines),
                latestDeliveries(tenantId, requestLines));
    }

    @Override
    @Transactional(readOnly = true)
    public Map<Long, StopClosure> closures(Long tenantId, java.util.Collection<Long> medicationRequestIds) {
        Map<Long, StopClosure> result = new java.util.LinkedHashMap<>();
        if (tenantId == null || medicationRequestIds == null) return result;
        List<Long> ids = medicationRequestIds.stream().distinct().toList();
        if (ids.isEmpty()) return result;
        Map<Long, MedicationRequestDirectory.MedicationRequestSnapshot> routing =
                requests.routingSnapshots(tenantId, ids);
        if (routing == null || routing.isEmpty()) return result;
        Map<Long, List<DispenseTaskLine>> linesByRequest = new java.util.LinkedHashMap<>();
        for (DispenseTaskLine line : lines.findByTenantIdAndRequestIdIn(tenantId, ids).stream()
                .sorted(Comparator.comparing(DispenseTaskLine::id)).toList()) {
            linesByRequest.computeIfAbsent(line.requestId(), ignored -> new java.util.ArrayList<>()).add(line);
        }
        List<DispenseTaskLine> allLines = linesByRequest.values().stream().flatMap(List::stream).toList();
        List<Long> taskIds = allLines.stream().map(DispenseTaskLine::taskId).distinct().toList();
        Map<Long, DispenseTask> taskById = new java.util.LinkedHashMap<>();
        if (!taskIds.isEmpty()) {
            for (DispenseTask task : tasks.findByTenantIdAndIdIn(tenantId, taskIds)) {
                taskById.putIfAbsent(task.id(), task);
            }
        }
        Map<Long, BigDecimal> consumedByLine = consumedQuantities(tenantId, allLines);
        Map<Long, Delivery> deliveryByLine = latestDeliveries(tenantId, allLines);
        for (Long id : ids) {
            MedicationRequestDirectory.MedicationRequestSnapshot request = routing.get(id);
            if (request == null) continue;
            if (!"CANCELLED".equals(request.status())) {
                result.put(id, StopClosure.notStopped(request.quantityUnit()));
                continue;
            }
            List<DispenseTaskLine> requestLines = linesByRequest.getOrDefault(id, List.of());
            if (requestLines.isEmpty()) {
                result.put(id, cancelled(null, request.quantityUnit()));
                continue;
            }
            result.put(id, stoppedClosure(requestLines, taskById.get(requestLines.getFirst().taskId()),
                    consumedByLine, deliveryByLine));
        }
        return result;
    }

    private StopClosure stoppedClosure(List<DispenseTaskLine> requestLines, DispenseTask firstTask,
                                       Map<Long, BigDecimal> consumedByLine, Map<Long, Delivery> deliveryByLine) {
        if (firstTask == null) throw notFound("DISPENSE_TASK_NOT_FOUND", "住院停嘱对应的药房任务不存在");
        DispenseTaskLine first = requestLines.getFirst();
        BigDecimal dispensed = BigDecimal.ZERO;
        BigDecimal returned = BigDecimal.ZERO;
        BigDecimal consumed = BigDecimal.ZERO;
        BigDecimal returnable = BigDecimal.ZERO;
        Delivery latest = new Delivery(null, null);
        for (DispenseTaskLine line : requestLines) {
            BigDecimal factor = line.baseQuantityFactor();
            BigDecimal lineDispensed = line.dispensedQuantity().multiply(factor);
            BigDecimal lineReturned = line.returnedQuantity().multiply(factor);
            BigDecimal lineConsumed = consumedByLine.getOrDefault(line.id(), BigDecimal.ZERO);
            dispensed = dispensed.add(lineDispensed);
            returned = returned.add(lineReturned);
            consumed = consumed.add(lineConsumed);
            returnable = returnable.add(lineDispensed.subtract(lineReturned).subtract(lineConsumed)
                    .max(BigDecimal.ZERO));
            Delivery candidate = deliveryByLine.getOrDefault(line.id(), new Delivery(null, null));
            if (candidate.id() != null) latest = candidate;
        }
        BigDecimal factor = first.baseQuantityFactor();
        if (dispensed.signum() == 0) return cancelled(firstTask, first.dispenseUnitCode());
        String status = returnable.signum() > 0 ? "RETURN_REQUIRED" : "STOPPED";
        String action = action(status, latest.status());
        return new StopClosure(status, firstTask.id(), firstTask.status().name(),
                operationQuantity(dispensed, factor), operationQuantity(consumed, factor),
                operationQuantity(returned, factor), operationQuantity(returnable, factor),
                first.dispenseUnitCode(), latest.id(), latest.status(), action);
    }

    private Map<Long, BigDecimal> consumedQuantities(Long tenantId, List<DispenseTaskLine> requestLines) {
        Map<Long, BigDecimal> consumedByLine = new java.util.HashMap<>();
        if (requestLines.isEmpty()) return consumedByLine;
        for (var value : consumptions.consumedBaseQuantityByTaskLineIds(tenantId, requestLines.stream()
                .map(DispenseTaskLine::id).distinct().toList())) {
            consumedByLine.put(value.getTaskLineId(), value.getConsumedQuantity());
        }
        return consumedByLine;
    }

    /** 一次装载各发药行的最近发药与配送闸门；语义与逐行 {@code latestDelivery} 一致。 */
    private Map<Long, Delivery> latestDeliveries(Long tenantId, List<DispenseTaskLine> requestLines) {
        List<Long> taskIds = requestLines.stream().map(DispenseTaskLine::taskId).distinct().toList();
        Map<Long, Long> latestDispenseByTask = new java.util.HashMap<>();
        for (MedicationDispense value : dispenses.findByTenantIdAndTaskIdInOrderByOccurredAtAscIdAsc(tenantId,
                taskIds)) {
            if ("DISPENSE".equals(value.dispenseType()) || "REDISPENSE".equals(value.dispenseType())) {
                latestDispenseByTask.put(value.taskId(), value.id());
            }
        }
        Map<Long, WardDeliveryDirectory.DeliveryGate> gates = latestDispenseByTask.isEmpty() ? Map.of()
                : wardDeliveries.deliveryGates(tenantId, latestDispenseByTask.values());
        Map<Long, Delivery> result = new java.util.HashMap<>();
        for (DispenseTaskLine line : requestLines) {
            Long dispenseId = latestDispenseByTask.get(line.taskId());
            WardDeliveryDirectory.DeliveryGate gate = dispenseId == null ? null : gates.get(dispenseId);
            result.put(line.id(), gate == null || gate.deliveryId() == null ? new Delivery(null, null)
                    : new Delivery(gate.deliveryId(), gate.status()));
        }
        return result;
    }

    private StopClosure cancelled(DispenseTask task, String unitCode) {
        return new StopClosure("CANCELLED", task == null ? null : task.id(),
                task == null ? null : task.status().name(), BigDecimal.ZERO, BigDecimal.ZERO,
                BigDecimal.ZERO, BigDecimal.ZERO, unitCode, null, null, "AUTO_CANCELLED");
    }

    private BigDecimal operationQuantity(BigDecimal baseQuantity, BigDecimal factor) {
        return baseQuantity.divide(factor, 8, RoundingMode.HALF_UP).stripTrailingZeros();
    }

    private String action(String status, String deliveryStatus) {
        if (!"RETURN_REQUIRED".equals(status)) return "NONE";
        if ("IN_TRANSIT".equals(deliveryStatus) || "DISCREPANCY".equals(deliveryStatus)) return "WAIT_RECEIPT";
        if ("RECEIVED".equals(deliveryStatus) || "RESOLVED".equals(deliveryStatus)) return "WARD_RETURN";
        return "PHARMACY_RETURN";
    }

    private record Delivery(Long id, String status) {}
}
