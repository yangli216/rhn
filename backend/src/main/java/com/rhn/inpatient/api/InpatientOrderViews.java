package com.rhn.inpatient.api;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public final class InpatientOrderViews {
    private InpatientOrderViews() {
    }

    public record DoctorWorklistView(List<OrderView> orders) {
        public DoctorWorklistView {
            orders = List.copyOf(orders);
        }
    }

    public record NurseWorklistView(List<TaskView> tasks) {
        public NurseWorklistView {
            tasks = List.copyOf(tasks);
        }
    }

    public record OrderView(
            Long id, long revision, String orderNo, String orderCategory, String durationType, String status,
            Long episodeId, String episodeNo, Long encounterId, Long residentId, String residentName,
            Long organizationId, Long departmentId,
            Long catalogItemId, Long medicationId, String itemCode, String itemName, String unitCode,
            BigDecimal dosageAmount, String dosageUnit, String routeCode, String frequencyCode, String instructions,
            Long authoredPractitionerId, Long authoredBy, Instant authoredAt,
            Long signedBy, Instant signedAt, Long verifiedBy, Instant verifiedAt,
            Long stoppedBy, Instant stoppedAt, String stopReason,
            MedicationClosureView medicationClosure, List<TaskView> tasks) {
        public OrderView {
            tasks = List.copyOf(tasks);
        }
    }

    public record MedicationClosureView(
            String status, Long dispenseTaskId, String pharmacyTaskStatus,
            BigDecimal dispensedQuantity, BigDecimal consumedQuantity,
            BigDecimal returnedQuantity, BigDecimal returnableQuantity, String unitCode,
            Long deliveryId, String deliveryStatus, String action) {
    }

    public record TaskView(
            Long id, long revision, Long orderId, String orderNo, String orderCategory, String durationType,
            Long episodeId, Long encounterId, Long residentId, String residentName,
            Long organizationId, Long departmentId,
            String itemCode, String itemName, String unitCode, BigDecimal dosageAmount, String dosageUnit,
            String routeCode, String frequencyCode, String instructions,
            int occurrenceNo, Instant scheduledAt, String status,
            String outcomeCode, String executionNote, Instant completedAt, Long completedBy,
            Instant cancelledAt, String cancelReason,
            boolean pharmacyFulfillmentRequired, boolean pharmacyFulfilled,
            Long dispenseId, BigDecimal netDispensedQuantity, String pharmacyFulfillmentStatus,
            List<MedicationConsumptionView> medicationConsumptions) {
        public TaskView {
            medicationConsumptions = List.copyOf(medicationConsumptions);
        }
    }

    public record MedicationConsumptionView(
            Long id, Long dispenseTaskLineId, Long dispenseId, Long dispenseLineId,
            BigDecimal consumedQuantity, String dispenseUnitCode,
            BigDecimal consumedBaseQuantity, String baseUnitCode,
            String commandCode, Instant consumedAt) {
    }
}
