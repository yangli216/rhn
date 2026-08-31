package com.rhn.pharmacy.api;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public final class WardMedicationReturnViews {
    private WardMedicationReturnViews() {
    }

    public record ReturnableMedicationLineView(
            Long originalDispenseId, Long originalDispenseLineId, Long requestId,
            Long residentId, Long encounterId, Long stockSiteId, Long nursingUnitDepartmentId,
            String medicationName, BigDecimal issuedQuantity, BigDecimal returnedQuantity,
            BigDecimal consumedQuantity, BigDecimal pendingReturnQuantity,
            BigDecimal returnableQuantity, String unitCode, BigDecimal baseQuantityFactor,
            String baseUnitCode) {
    }

    public record WardMedicationReturnLineView(
            Long id, Long requestId, Long originalDispenseId, Long originalDispenseLineId,
            Long dispenseTaskLineId, String medicationName, BigDecimal requestedQuantity,
            String unitCode, BigDecimal requestedBaseQuantity, String baseUnitCode,
            String disposition, Long stockReturnId, Long returnDispenseId) {
    }

    public record WardMedicationReturnEventView(
            Long id, String eventType, String fromStatus, String toStatus,
            String commandCode, Instant occurredAt, Long occurredBy, String note) {
    }

    public record WardMedicationReturnRequestView(
            Long id, long revision, String requestNo, String status,
            Long organizationId, Long stockSiteId, Long nursingUnitDepartmentId,
            Long residentId, Long encounterId, Instant requestedAt, Long requestedBy,
            String requestNote, Instant handedOverAt, Long handedOverBy, String handoverNote,
            Instant receivedAt, Long receivedBy, Long processorPractitionerId,
            Long processorAssignmentId, String receiptNote,
            List<WardMedicationReturnLineView> lines,
            List<WardMedicationReturnEventView> events) {
        public WardMedicationReturnRequestView {
            lines = List.copyOf(lines);
            events = List.copyOf(events);
        }
    }
}
