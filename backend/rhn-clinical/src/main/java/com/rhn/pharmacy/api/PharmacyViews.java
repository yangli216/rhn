package com.rhn.pharmacy.api;

import com.rhn.outpatient.api.MedicationRequestDirectory.MedicationRequestSnapshot;
import tools.jackson.databind.JsonNode;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public final class PharmacyViews {
    private PharmacyViews() {}

    public record StockSiteView(
            Long id, long revision, Long organizationId, Long departmentId,
            String code, String name, String siteType, String serviceScope,
            boolean active, LocalDate validFrom, LocalDate validTo) {}

    public record DispenseRouteView(
            Long id, long revision, Long organizationId, String code, String name,
            String careSetting, Long sourceDepartmentId, String medicationType, Long targetStockSiteId,
            boolean active, LocalDate validFrom, LocalDate validTo,
            String description, Instant updatedAt) {}

    public record StockItemView(
            Long id, long revision, Long stockSiteId, Long catalogItemId, Long packageId,
            Long medicationId, String productCode, String productName,
            String packageUnitCode, String packageUnitName, String packageSpec,
            BigDecimal packageFactor, String baseUnitCode, String issuePolicy,
            boolean negativeAllowed, boolean lotRequired, boolean traceRequired,
            boolean splitAllowed, boolean coldChain, boolean controlled,
            String controlLevel, boolean highAlert, String status,
            String manufacturerName) {}

    public record StockBinView(
            Long id, long revision, Long stockSiteId, Long parentBinId,
            String code, String name, String binType, String stockDefault,
            boolean receiveAllowed, boolean pickAllowed, boolean countAllowed,
            int sortOrder, boolean active) {}

    public record StockLotView(
            Long id, long revision, Long catalogItemId, Long packageId, String lotNo,
            LocalDate productionDate, LocalDate expiryDate, String approvalCodeSnapshot,
            String manufacturerNameSnapshot, String qualityStatus, Instant qualityAt,
            Long qualityUserId, String status) {}

    public record InventoryBalanceView(
            Long id, long revision, Long stockSiteId, Long stockBinId, String stockBinCode,
            Long stockItemId, Long stockLotId, String lotNo, LocalDate expiryDate,
            String stockStatus, String baseUnitCode, BigDecimal quantityOnHand,
            BigDecimal quantityReserved, BigDecimal quantityFrozen, BigDecimal quantityAvailable,
            BigDecimal averageUnitCost, Instant projectedAt) {}

    public record InventoryTransactionLineView(
            Long id, int sortOrder, Long stockSiteId, Long stockBinId, Long stockItemId,
            Long stockLotId, Long packageId, String stockStatus, BigDecimal operationQuantity,
            String operationUnitCode, BigDecimal baseQuantityFactor, BigDecimal quantityDelta,
            BigDecimal unitCost, BigDecimal amountDelta) {}

    public record InventoryTransactionView(
            Long id, Long inventoryPeriodId, String transactionNo, String requestCode,
            String transactionType, String sourceType, String sourceCode,
            Instant occurredAt, Instant postedAt, Long postedBy, String description,
            List<InventoryTransactionLineView> lines) {}

    public record InventoryPageView<T>(
            List<T> content, int page, int size, long totalElements, int totalPages,
            boolean first, boolean last) {}

    public record InventoryReservationView(
            Long id, long revision, Long stockSiteId, Long stockBinId, String stockBinCode,
            Long stockItemId, Long stockLotId, String lotNo, LocalDate expiryDate,
            Long requestId, String reservationGroupCode, String reservationType, String status,
            BigDecimal quantityReserved, BigDecimal quantityConsumed, String baseUnitCode,
            Instant createdAt, Instant expiresAt, Instant consumedAt, Long consumedBy,
            Instant releasedAt, Long releasedBy,
            String releaseReason) {}

    public record ReservationResultView(
            Long taskId, String taskNo, String taskStatus, BigDecimal requiredBaseQuantity,
            BigDecimal reservedBaseQuantity, List<InventoryReservationView> allocations) {}

    public record PharmacyInboxItem(
            MedicationRequestSnapshot request, Long taskId, String taskNo, String taskStatus,
            String closureStatus, Long stockItemId, String selectedProductName, String latestReviewResult,
            String residentName, String healthRecordNo, String residentPhone,
            Instant dispensedAt, Long dispenserPractitionerId,
            BigDecimal plannedQuantity, BigDecimal dispensedQuantity, BigDecimal returnedQuantity,
            String dispenseUnitCode,
            PharmacyClinicalContextView clinicalContext,
            List<MedicationRequestSnapshot> prescriptionRequests) {}

    public record PharmacyClinicalContextView(
            Long encounterId, String encounterNo, String clinicianId, String chiefComplaint,
            List<PharmacyDiagnosisView> diagnoses) {}

    public record PharmacyDiagnosisView(String code, String display, String type) {}

    public record DispenseTaskView(
            Long id, long revision, Long residentId, Long encounterId, Long stockSiteId,
            String taskNo, String taskType, String priority, String status, String closureStatus,
            Instant createdAt, Instant dueAt, Instant pickedAt, Long assignedPractitionerId,
            Long pickedByUserId, Long pickedAssignmentId, String pickDescription, String description,
            List<DispenseTaskLineView> lines, List<PharmacyReviewView> reviews) {}

    public record DispenseTaskLineView(
            Long id, Long requestId, Long stockItemId, Long packageId,
            BigDecimal requestedQuantity, BigDecimal plannedQuantity,
            BigDecimal dispensedQuantity, BigDecimal returnedQuantity,
            String dispenseUnitCode, BigDecimal baseQuantityFactor,
            boolean split, boolean traceRequired, String status,
            String productCode, String productName, String packageSpec,
            JsonNode itemAttributeSnapshot, String itemAttributeHash) {}

    public record PharmacyReviewView(
            Long id, String reviewNo, String result, String reasonCode, String description,
            Long pharmacistPractitionerId, Long reviewerUserId, Long reviewerAssignmentId,
            Instant reviewedAt) {}

    public record PrescriptionReviewModeView(
            String mode, boolean enabled, String timing, String parameterKey) {}

    public record MedicationDispenseLineView(
            Long id, Long taskLineId, Long originalDispenseLineId, int sortOrder,
            Long stockBinId, String stockBinCode, Long stockItemId, Long stockLotId,
            String lotNo, LocalDate expiryDate, Long inventoryTransactionLineId,
            BigDecimal quantityDispensed, String dispenseUnitCode, BigDecimal baseQuantityFactor) {}

    public record MedicationDispenseView(
            Long id, Long taskId, Long residentId, Long encounterId, Long stockSiteId,
            Long originalDispenseId, String dispenseNo, String dispenseType, Instant occurredAt,
            Long dispenserPractitionerId, Long dispenserUserId, Long dispenserAssignmentId,
            Long checkerPractitionerId, Long checkerUserId, Long checkerAssignmentId, Instant checkedAt,
            BigDecimal operationQuantity, String operationUnitCode, String description,
            List<MedicationDispenseLineView> lines) {}

    public record StockReturnLineView(
            Long id, Long originalDispenseLineId, int sortOrder, Long stockBinId,
            Long stockItemId, Long stockLotId, Long inventoryTransactionLineId,
            BigDecimal quantityAccepted, String returnUnitCode, BigDecimal baseQuantityFactor,
            String disposition, String exceptionDescription) {}

    public record StockReturnView(
            Long id, long revision, Long stockSiteId, Long residentId, Long originalDispenseId,
            Long returnDispenseId, String returnNo, String returnType, String status,
            String reasonCode, Instant requestedAt, Instant confirmedAt, Long confirmedBy,
            String description, List<StockReturnLineView> lines) {}

    public record DispenseTraceView(
            Long taskId, String taskNo, String taskStatus, BigDecimal plannedQuantity,
            BigDecimal dispensedQuantity, BigDecimal returnedQuantity, BigDecimal netDispensedQuantity,
            String unitCode, List<MedicationDispenseView> events, List<StockReturnView> returns) {}

    public record PreparationResultView(
            Long taskId, String taskNo, String taskStatus, Instant pickedAt,
            Long pickerPractitionerId, Long pickerUserId, Long pickerAssignmentId,
            String description) {}

    public record WardDeliveryLineView(
            Long id, Long dispenseId, Long residentId, Long encounterId,
            String residentName, String medicationName, BigDecimal expectedQuantity,
            BigDecimal receivedQuantity, String unitCode, String status,
            String discrepancyCode, String discrepancyNote) {}

    public record WardDeliveryEventView(
            Long id, String eventType, String fromStatus, String toStatus,
            String commandCode, Instant occurredAt, Long occurredBy, String note) {}

    public record WardDeliveryView(
            Long id, long revision, Long organizationId, Long stockSiteId,
            Long nursingUnitDepartmentId, String deliveryNo, String status,
            String stockSiteName, String nursingUnitName, Instant createdAt, Long createdBy,
            Instant dispatchedAt, Long dispatchedBy, String dispatchNote,
            Instant receivedAt, Long receivedBy, String receiptNote, String discrepancyNote,
            Instant resolvedAt, Long resolvedBy, String resolutionCode, String resolutionNote,
            List<WardDeliveryLineView> lines, List<WardDeliveryEventView> events) {}
}
