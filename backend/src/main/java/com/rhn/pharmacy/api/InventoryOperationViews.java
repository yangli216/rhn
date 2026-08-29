package com.rhn.pharmacy.api;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public final class InventoryOperationViews {
    private InventoryOperationViews() {}

    public record SupplierView(Long id, long revision, Long organizationId, String code, String name,
                               String unifiedCreditCode, String licenseNo, LocalDate licenseValidTo,
                               String contactName, String contactPhone, String status,
                               LocalDate validFrom, LocalDate validTo) {}

    public record SupplierSupplyItemView(Long id, long revision, Long supplierId, Long catalogItemId,
                                         Long packageId, BigDecimal agreementPrice, BigDecimal taxRate,
                                         boolean purchaseEnabled, LocalDate validFrom, LocalDate validTo) {}

    public record PurchaseOrderLineView(Long id, long revision, int sortOrder, Long stockItemId,
                                        Long packageId, BigDecimal orderedQuantity, BigDecimal receivedQuantity,
                                        BigDecimal remainingQuantity, BigDecimal unitPrice, BigDecimal taxRate,
                                        String lineStatus, String description) {}

    public record PurchaseOrderView(Long id, long revision, Long organizationId, Long stockSiteId,
                                    Long supplierId, String orderNo, String requestCode, String status,
                                    LocalDate orderDate, LocalDate expectedDate, Instant submittedAt,
                                    Long submittedBy, Instant approvedAt, Long approvedBy,
                                    String approvalReason, String description, Instant createdAt,
                                    Long createdBy, Instant updatedAt, Long updatedBy,
                                    List<PurchaseOrderLineView> lines) {}

    public record GoodsReceiptLineView(Long id, long revision, Long purchaseOrderLineId, int sortOrder,
                                       Long stockItemId, Long packageId, Long destinationBinId, String lotNo,
                                       LocalDate productionDate, LocalDate expiryDate,
                                       BigDecimal deliveredQuantity, BigDecimal acceptedQuantity,
                                       BigDecimal rejectedQuantity, BigDecimal unitCost, String qualityStatus,
                                       String rejectionReason, Long stockLotId, Long inventoryTransactionId) {}

    public record GoodsReceiptView(Long id, long revision, Long organizationId, Long stockSiteId,
                                   Long purchaseOrderId, Long supplierId, String receiptNo, String requestCode,
                                   String deliveryNoteNo, String status, Instant receivedAt, Long receivedBy,
                                   Instant inspectedAt, Long inspectedBy, Instant postedAt, Long postedBy,
                                   String description, Instant createdAt, Long createdBy,
                                   Instant updatedAt, Long updatedBy, List<GoodsReceiptLineView> lines) {}

    public record DocumentEventView(Long id, String documentType, Long documentId, String documentNo,
                                    String eventType, String fromStatus, String toStatus, String reason,
                                    String correlationId, Instant occurredAt, Long occurredBy) {}

    public record RequisitionAllocationView(Long id, Long requisitionLineId, Long stockBinId, Long stockLotId,
                                             String stockStatus, BigDecimal allocatedQuantity,
                                             BigDecimal issuedQuantity, String status) {}
    public record RequisitionLineView(Long id, long revision, int sortOrder, Long stockItemId,
                                      BigDecimal requestedQuantity, BigDecimal approvedQuantity,
                                      BigDecimal issuedQuantity, String baseUnitCode, String lineStatus,
                                      String description, List<RequisitionAllocationView> allocations) {}
    public record RequisitionView(Long id, long revision, Long organizationId, Long sourceSiteId,
                                  Long requestingDepartmentId, Long destinationSiteId, String requisitionNo,
                                  String requestCode, String status, Instant requestedAt, Long requestedBy,
                                  Instant approvedAt, Long approvedBy, Instant pickedAt, Long pickedBy,
                                  Instant issuedAt, Long issuedBy, String reason, String description,
                                  Long inventoryTransactionId, List<RequisitionLineView> lines) {}

    public record TransferAllocationView(Long id, Long transferLineId, Long sourceBinId, Long destinationBinId,
                                         Long stockLotId, String stockStatus, BigDecimal dispatchedQuantity,
                                         BigDecimal receivedQuantity, BigDecimal damagedQuantity, String status) {}
    public record TransferLineView(Long id, long revision, int sortOrder, Long sourceStockItemId,
                                   Long destinationStockItemId, BigDecimal requestedQuantity,
                                   BigDecimal approvedQuantity, BigDecimal dispatchedQuantity,
                                   BigDecimal receivedQuantity, BigDecimal damagedQuantity, String baseUnitCode,
                                   String lineStatus, String discrepancyReason,
                                   List<TransferAllocationView> allocations) {}
    public record TransferView(Long id, long revision, Long organizationId, Long sourceSiteId,
                               Long destinationSiteId, String transferNo, String requestCode, String status,
                               Instant requestedAt, Long requestedBy, Instant approvedAt, Long approvedBy,
                               Instant dispatchedAt, Long dispatchedBy, Instant receivedAt, Long receivedBy,
                               String reason, String description, Long outboundTransactionId,
                               Long inboundTransactionId, List<TransferLineView> lines) {}
    public record CountLineView(Long id,long revision,int sortOrder,Long inventoryBalanceId,long inventoryBalanceRevision,
                                Long stockBinId,Long stockItemId,Long stockLotId,String stockStatus,
                                BigDecimal bookQuantity,BigDecimal countedQuantity,BigDecimal varianceQuantity,
                                String countResult,Instant countedAt,Long countedBy,String varianceReason){}
    public record CountView(Long id,long revision,Long organizationId,Long stockSiteId,Long stockBinId,
                            String countNo,String requestCode,String countType,String status,Instant snapshotAt,
                            Instant startedAt,Long startedBy,Instant submittedAt,Long submittedBy,
                            Instant approvedAt,Long approvedBy,Instant postedAt,Long postedBy,String reason,
                            String description,Long inventoryTransactionId,List<CountLineView> lines){}
}
