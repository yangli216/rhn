package com.rhn.pharmacy.api;

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
                                  BigDecimal remainingBaseQuantity, String status, Instant openedAt,
                                  Long openedBy, Instant updatedAt, Instant closedAt) {}

    public record SplitEventView(Long id, Long openPackageId, String eventType, String sourceType,
                                 Long sourceId, String sourceNo, BigDecimal quantityDelta,
                                 BigDecimal balanceAfter, Instant occurredAt, Long occurredBy,
                                 String description) {}

    public record ReconciliationLineView(Long id, Long stockBinId, Long stockItemId, Long stockLotId,
                                         String stockStatus, String issueType, BigDecimal expectedQuantity,
                                         BigDecimal actualQuantity, BigDecimal differenceQuantity,
                                         String severity, String description) {}

    public record ReconciliationRunView(Long id, Long stockSiteId, String runNo, String runType,
                                        String status, LocalDate businessDate, Instant startedAt,
                                        Instant completedAt, Long runBy, int dimensionCount,
                                        int issueCount, List<ReconciliationLineView> lines) {}
}
