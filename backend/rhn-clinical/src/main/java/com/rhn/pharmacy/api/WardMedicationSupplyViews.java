package com.rhn.pharmacy.api;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import com.rhn.pharmacy.api.PharmacyViews.WardDeliveryView;

/** Read models for the lightweight inpatient rolling-supply workbench. */
public final class WardMedicationSupplyViews {
    private WardMedicationSupplyViews() {
    }

    public record SupplyBatchView(
            Long id, long revision, String batchNo, Long organizationId, Long stockSiteId,
            Long nursingUnitDepartmentId, String nursingUnitName,
            LocalDate businessDate, String shiftCode, String timezoneCode,
            Instant windowStart, Instant windowEnd, Instant cutoffAt,
            String batchType, String supplyMode, String status,
            SupplySummaryView summary, List<SupplyLineView> lines,
            Instant createdAt, Instant updatedAt) {
        public SupplyBatchView {
            lines = List.copyOf(lines);
        }
    }

    public record SupplySummaryView(
            int totalLineCount, int coveredLineCount, int gapLineCount,
            int issuedLineCount, int pendingReturnLineCount, int exceptionLineCount) {
    }

    public record SupplyLineView(
            Long id, long revision, Long batchId, Long requestId, Long encounterId, Long residentId,
            String bedNo, String residentName, Long catalogItemId, Long medicationId,
            String medicationCode, String medicationName, Instant scheduledAt,
            BigDecimal requestedQuantity, BigDecimal coveredQuantity,
            BigDecimal issuedQuantity, BigDecimal pendingReturnQuantity, String unitCode,
            int occurrenceCount, String status, Long stockItemId,
            Long dispenseTaskLineId, Long dispenseTaskId, String dispenseTaskStatus, String exceptionMessage,
            List<SupplyOccurrenceView> occurrences) {
        public SupplyLineView {
            occurrences = List.copyOf(occurrences);
        }
    }

    public record SupplyOccurrenceView(
            Long id, long revision, Long orderTaskId, Instant scheduledAt,
            BigDecimal requiredQuantity, String quantityUnitCode,
            BigDecimal requiredBaseQuantity, String baseUnitCode, String status) {
    }

    /** Result of issuing a ward-supply batch and grouping its dispense events for handover. */
    public record SupplyFulfillmentView(
            SupplyBatchView batch, List<WardDeliveryView> deliveries) {
        public SupplyFulfillmentView {
            deliveries = List.copyOf(deliveries);
        }
    }

}
