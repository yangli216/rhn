package com.rhn.pharmacy.api;

import com.rhn.platform.dictionary.api.DictionaryBinding;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public final class InventoryTraceViews {
    private InventoryTraceViews() {}

    public record TraceCodeView(Long id, long revision, Long stockSiteId, Long stockBinId,
                                Long stockItemId, Long stockLotId, Long goodsReceiptLineId,
                                String traceCode, String productCode, String productName, String lotNo,
                                BigDecimal packageQuantity, BigDecimal baseQuantity, BigDecimal remainingBaseQuantity, @DictionaryBinding("SUP_TRACE_CODE_STATUS") String status,
                                String currentDocumentType, Long currentDocumentId, String currentDocumentNo,
                                Instant receivedAt, Instant issuedAt, Instant updatedAt) {}

    public record TraceCodeBatchScanView(List<TraceCodeView> codes, List<String> notFoundCodes) {
        public TraceCodeBatchScanView {
            codes = List.copyOf(codes);
            notFoundCodes = List.copyOf(notFoundCodes);
        }
    }

    public record TraceEventView(Long id, @DictionaryBinding("SUP_TRACE_EVENT_TYPE") String eventType, @DictionaryBinding("SUP_TRACE_CODE_STATUS") String fromStatus, @DictionaryBinding("SUP_TRACE_CODE_STATUS") String toStatus,
                                 Long fromSiteId, Long toSiteId, Long fromBinId, Long toBinId,
                                 String documentType, Long documentId, String documentNo,
                                 String reason, BigDecimal quantityDelta, BigDecimal balanceAfter,
                                 Instant occurredAt, Long occurredBy) {}

    public record TraceDetailView(TraceCodeView code, List<TraceEventView> events) {}
    /** 追溯码台账行：随行返回批号效期，前端不再按经营项目逐个拉取批次。 */
    public record TraceCodeLedgerRowView(TraceCodeView code, LocalDate lotExpiryDate) {}
    public record TraceCodeMetricsView(long total, long available, long transit, long exceptions) {}
    public record TraceCodePageView(List<TraceCodeLedgerRowView> content, int page, int size, long totalElements,
                                    int totalPages, boolean first, boolean last,
                                    TraceCodeMetricsView metrics) {}
    public record ReceiptTraceLineView(Long goodsReceiptLineId, Long stockItemId, boolean traceRequired,
                                       BigDecimal acceptedQuantity, int registeredCount, boolean complete) {}
    public record ReceiptTraceSummaryView(Long goodsReceiptId, int requiredCount, int registeredCount,
                                          boolean complete, List<ReceiptTraceLineView> lines) {}
}
