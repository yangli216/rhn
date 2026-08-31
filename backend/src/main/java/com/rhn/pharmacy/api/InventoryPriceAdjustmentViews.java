package com.rhn.pharmacy.api;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public final class InventoryPriceAdjustmentViews {
    private InventoryPriceAdjustmentViews() {}

    public record PriceAdjustmentView(
            Long id, long revision, Long stockSiteId, Long inventoryPeriodId, String adjustmentNo,
            String requestCode, String adjustmentType, String priceType, LocalDate businessDate,
            String currencyCode, String priceDocumentCode, String reason, String status,
            int lineCount, BigDecimal totalValueBefore, BigDecimal totalValueAfter,
            BigDecimal totalAdjustmentAmount, Instant createdAt, Long createdBy,
            Instant submittedAt, Long submittedBy, Instant approvedAt, Long approvedBy,
            Instant postedAt, Long postedBy, List<PriceAdjustmentLineView> lines) {}

    public record PriceAdjustmentLineView(
            Long id, long revision, int lineNo, Long stockItemId, Long catalogItemId, Long packageId,
            Long oldCatalogPriceId, Long newCatalogPriceId, BigDecimal oldSalePrice,
            BigDecimal newSalePrice, BigDecimal oldUnitCost, BigDecimal newUnitCost,
            BigDecimal quantitySnapshot, BigDecimal valueBefore, BigDecimal valueAfter,
            BigDecimal adjustmentAmount, BigDecimal roundingAmount, String lineStatus,
            String errorCode, String errorMessage, List<PriceAdjustmentDetailView> details) {}

    public record PriceAdjustmentDetailView(
            Long id, Long inventoryBalanceId, long inventoryBalanceRevision, Long stockBinId,
            Long stockLotId, String lotNo, String stockStatus, BigDecimal quantitySnapshot,
            BigDecimal unitPriceBefore, BigDecimal unitPriceAfter, BigDecimal valueBefore,
            BigDecimal valueAfter, BigDecimal adjustmentAmount, BigDecimal roundingAmount,
            Long valuationEntryId) {}
}
