package com.rhn.pharmacy.api;

import com.rhn.platform.dictionary.api.DictionaryBinding;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public final class InventoryAccuracyViews {
    private InventoryAccuracyViews() {}

    public record OpenPackageView(Long id, long revision, Long stockSiteId, Long stockBinId,
                                  Long stockItemId, Long stockLotId, Long packageId, Long traceCodeId,
                                  String requestCode, String sourceUnitCode, String baseUnitCode,
                                  BigDecimal packageFactor, BigDecimal openedBaseQuantity,
                                  BigDecimal remainingBaseQuantity, @DictionaryBinding("SUP_OPEN_PACKAGE_STATUS") String status, Instant openedAt,
                                  Long openedBy, Instant updatedAt, Instant closedAt) {}

    public record SplitEventView(Long id, Long openPackageId, @DictionaryBinding("SUP_SPLIT_EVENT_TYPE") String eventType, String sourceType,
                                 Long sourceId, String sourceNo, BigDecimal quantityDelta,
                                 BigDecimal balanceAfter, Instant occurredAt, Long occurredBy,
                                 String description) {}

    public record ReconciliationLineView(Long id, Long stockBinId, Long stockItemId, Long stockLotId,
                                         @DictionaryBinding("SUP_STOCK_STATUS") String stockStatus, @DictionaryBinding("SUP_RECONCILIATION_ISSUE_TYPE") String issueType, BigDecimal expectedQuantity,
                                         BigDecimal actualQuantity, BigDecimal differenceQuantity,
                                         String valuationBasis, String currencyCode, BigDecimal expectedAmount,
                                         BigDecimal actualAmount, BigDecimal differenceAmount,
                                         String severity, String description) {}

    public record ReconciliationRunView(Long id, Long stockSiteId, String runNo, String runType,
                                        String status, LocalDate businessDate, Instant startedAt,
                                        Instant completedAt, Long runBy, int dimensionCount,
                                        int issueCount, List<ReconciliationLineView> lines) {}

    public record InventoryPeriodView(Long id, long revision, Long stockSiteId, Long previousPeriodId,
                                      Long closingRunId, String periodCode, LocalDate periodFrom,
                                      LocalDate periodTo, @DictionaryBinding("SUP_INVENTORY_PERIOD_STATUS") String status, Instant closedAt, Long closedBy,
                                      String description, Instant createdAt, Long createdBy) {}

    public record PeriodCloseTotalView(String valuationBasis, String currencyCode,
                                       BigDecimal openingValue, BigDecimal movementAmount,
                                       BigDecimal valuationAdjustmentAmount, BigDecimal roundingAdjustmentAmount,
                                       BigDecimal closingValue, BigDecimal balanceValue,
                                       BigDecimal valueDifference) {}

    public record PeriodCloseRunView(Long id, long revision, Long stockSiteId, Long inventoryPeriodId,
                                     Long previousPeriodId, Long reconciliationRunId, String runNo,
                                     String requestCode, String status, int dimensionCount,
                                     int differenceCount, Instant startedAt, Long startedBy,
                                     Instant validatedAt, Long validatedBy, Instant postedAt,
                                     Long postedBy, Instant completedAt, String failureCode,
                                     String failureMessage, List<PeriodCloseTotalView> totals) {}

    public record PeriodCloseDifferenceView(Long snapshotId, Long inventoryBalanceId, long inventoryBalanceRevision,
                                            Long stockBinId, Long stockItemId, Long stockLotId, String lotNo,
                                            @DictionaryBinding("SUP_STOCK_STATUS") String stockStatus,
                                            String baseUnitCode, BigDecimal openingQuantity,
                                            BigDecimal movementQuantity, BigDecimal closingQuantity,
                                            BigDecimal balanceQuantity, BigDecimal quantityDifference,
                                            String valuationBasis, String currencyCode, BigDecimal openingValue,
                                            BigDecimal movementAmount, BigDecimal valuationAdjustmentAmount,
                                            BigDecimal roundingAdjustmentAmount, BigDecimal closingValue,
                                            BigDecimal balanceValue, BigDecimal valueDifference) {}
}
