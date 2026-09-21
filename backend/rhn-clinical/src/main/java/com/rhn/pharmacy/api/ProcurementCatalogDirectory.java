package com.rhn.pharmacy.api;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public interface ProcurementCatalogDirectory {
    List<ProcurementCatalogOption> searchPurchasable(Long tenantId, Long stockSiteId, Long supplierId,
                                                     String query, LocalDate businessDate);

    List<ReceivableOrderLineOption> searchReceivableOrderLines(Long tenantId, Long purchaseOrderId,
                                                               String query, LocalDate businessDate);

    record ProcurementCatalogOption(
            Long id, long revision, Long stockSiteId, Long catalogItemId, Long packageId,
            Long medicationId, String productCode, String productName, String packageUnitCode,
            String packageUnitName, String packageSpec, BigDecimal packageFactor, String baseUnitCode,
            String issuePolicy, boolean negativeAllowed, boolean lotRequired, boolean traceRequired,
            boolean splitAllowed, boolean coldChain, boolean controlled, String controlLevel,
            boolean highAlert, String status, String manufacturerName, Long supplierSupplyItemId,
            BigDecimal agreementPrice, BigDecimal taxRate) {}

    record ReceivableOrderLineOption(
            Long purchaseOrderLineId, BigDecimal remainingQuantity, BigDecimal unitPrice, BigDecimal taxRate,
            ProcurementCatalogOption catalog) {}
}
