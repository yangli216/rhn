package com.rhn.pharmacy.api;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public final class InventoryTraceViews {
    private InventoryTraceViews() {}

    public record TraceCodeView(Long id, long revision, Long stockSiteId, Long stockBinId,
                                Long stockItemId, Long stockLotId, Long goodsReceiptLineId,
                                String traceCode, String productCode, String productName, String lotNo,
                                BigDecimal packageQuantity, BigDecimal baseQuantity, BigDecimal remainingBaseQuantity, String status,
                                String currentDocumentType, Long currentDocumentId, String currentDocumentNo,
                                Instant receivedAt, Instant issuedAt, Instant updatedAt) {}

    public record TraceEventView(Long id, String eventType, String fromStatus, String toStatus,
                                 Long fromSiteId, Long toSiteId, Long fromBinId, Long toBinId,
                                 String documentType, Long documentId, String documentNo,
                                 String reason, BigDecimal quantityDelta, BigDecimal balanceAfter,
                                 Instant occurredAt, Long occurredBy) {}

    public record TraceDetailView(TraceCodeView code, List<TraceEventView> events) {}
    public record ReceiptTraceLineView(Long goodsReceiptLineId, Long stockItemId, boolean traceRequired,
                                       BigDecimal acceptedQuantity, int registeredCount, boolean complete) {}
    public record ReceiptTraceSummaryView(Long goodsReceiptId, int requiredCount, int registeredCount,
                                          boolean complete, List<ReceiptTraceLineView> lines) {}
}
