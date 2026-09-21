package com.rhn.pharmacy.application;

import com.rhn.pharmacy.api.ProcurementCatalogDirectory;
import com.rhn.pharmacy.domain.PurchaseOrder;
import com.rhn.pharmacy.domain.PurchaseOrderLine;
import com.rhn.pharmacy.domain.StockItem;
import com.rhn.pharmacy.domain.StockSite;
import com.rhn.pharmacy.domain.Supplier;
import com.rhn.pharmacy.domain.SupplierSupplyItem;
import com.rhn.pharmacy.infrastructure.PurchaseOrderLineRepository;
import com.rhn.pharmacy.infrastructure.PurchaseOrderRepository;
import com.rhn.pharmacy.infrastructure.StockItemRepository;
import com.rhn.pharmacy.infrastructure.StockSiteRepository;
import com.rhn.pharmacy.infrastructure.SupplierRepository;
import com.rhn.pharmacy.infrastructure.SupplierSupplyItemRepository;
import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory;
import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory.CatalogOperationalSnapshot;
import com.rhn.platform.search.api.MasterDataSearchDirectory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class ProcurementCatalogService implements ProcurementCatalogDirectory {
    private final StockSiteRepository sites;
    private final StockItemRepository stockItems;
    private final SupplierRepository suppliers;
    private final SupplierSupplyItemRepository supplyItems;
    private final PurchaseOrderRepository orders;
    private final PurchaseOrderLineRepository orderLines;
    private final CatalogLifecycleDirectory catalogs;
    private final MasterDataSearchDirectory searches;

    public ProcurementCatalogService(StockSiteRepository sites, StockItemRepository stockItems,
                                     SupplierRepository suppliers, SupplierSupplyItemRepository supplyItems,
                                     PurchaseOrderRepository orders, PurchaseOrderLineRepository orderLines,
                                     CatalogLifecycleDirectory catalogs, MasterDataSearchDirectory searches) {
        this.sites = sites;
        this.stockItems = stockItems;
        this.suppliers = suppliers;
        this.supplyItems = supplyItems;
        this.orders = orders;
        this.orderLines = orderLines;
        this.catalogs = catalogs;
        this.searches = searches;
    }

    @Override
    @Transactional(readOnly = true)
    public List<ProcurementCatalogOption> searchPurchasable(Long tenantId, Long stockSiteId, Long supplierId,
                                                            String query, LocalDate businessDate) {
        LocalDate date = businessDate == null ? LocalDate.now() : businessDate;
        StockSite site = requireSite(tenantId, stockSiteId, date);
        Supplier supplier = requireSupplier(tenantId, supplierId, date);
        if (!site.organizationId().equals(supplier.organizationId())) {
            throw conflict("PURCHASE_SUPPLIER_ORG_MISMATCH", "供应商与采购库房不属于同一机构");
        }

        Map<CatalogPackageKey, SupplierSupplyItem> agreements = supplyItems
                .findByTenantIdAndSupplierIdOrderById(tenantId, supplierId).stream()
                .filter(value -> value.effective(date))
                .collect(Collectors.toMap(value -> new CatalogPackageKey(value.catalogItemId(), value.packageId()),
                        Function.identity(), (left, right) -> right));
        List<Candidate> candidates = stockItems.findByTenantIdAndStockSiteIdOrderById(tenantId, stockSiteId).stream()
                .filter(value -> "ACTIVE".equals(value.status()))
                .map(value -> candidate(site, value, agreements.get(
                        new CatalogPackageKey(value.catalogItemId(), value.basePackageId())), date))
                .filter(java.util.Objects::nonNull)
                .toList();
        return filterAndLimit(tenantId, site, query, candidates).stream().map(this::option).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<ReceivableOrderLineOption> searchReceivableOrderLines(Long tenantId, Long purchaseOrderId,
                                                                      String query, LocalDate businessDate) {
        LocalDate date = businessDate == null ? LocalDate.now() : businessDate;
        PurchaseOrder order = orders.findByIdAndTenantId(purchaseOrderId, tenantId)
                .orElseThrow(() -> notFound("PURCHASE_ORDER_NOT_FOUND", "未找到采购单"));
        if (!Set.of("APPROVED", "PARTIALLY_RECEIVED").contains(order.status())) return List.of();
        StockSite site = requireSite(tenantId, order.stockSiteId(), date);
        Map<Long, PurchaseOrderLine> lineByStockItem = orderLines
                .findByTenantIdAndPurchaseOrderIdOrderBySortOrder(tenantId, purchaseOrderId).stream()
                .filter(value -> value.remainingQuantity().signum() > 0 && !"COMPLETED".equals(value.lineStatus()))
                .collect(Collectors.toMap(PurchaseOrderLine::stockItemId, Function.identity()));
        if (lineByStockItem.isEmpty()) return List.of();
        Map<CatalogPackageKey, SupplierSupplyItem> agreements = supplyItems
                .findByTenantIdAndSupplierIdOrderById(tenantId, order.supplierId()).stream()
                .collect(Collectors.toMap(value -> new CatalogPackageKey(value.catalogItemId(), value.packageId()),
                        Function.identity(), (left, right) -> right));
        List<Candidate> candidates = stockItems.findAllById(lineByStockItem.keySet()).stream()
                .filter(value -> tenantId.equals(value.tenantId()) && stockSiteIdMatches(site, value))
                .map(value -> candidate(site, value, agreements.get(
                        new CatalogPackageKey(value.catalogItemId(), value.basePackageId())), date))
                .filter(java.util.Objects::nonNull)
                .toList();
        return filterAndLimit(tenantId, site, query, candidates).stream().map(value -> {
            PurchaseOrderLine line = lineByStockItem.get(value.stockItem().id());
            return new ReceivableOrderLineOption(line.id(), line.remainingQuantity(), line.unitPrice(),
                    line.taxRate(), option(value));
        }).toList();
    }

    private List<Candidate> filterAndLimit(Long tenantId, StockSite site, String query, List<Candidate> candidates) {
        if (query == null || query.isBlank()) {
            return candidates.stream().limit(searches.resolvePreference(
                    tenantId, site.organizationId(), site.departmentId()).resultLimit()).toList();
        }
        Collection<Long> catalogIds = candidates.stream().map(value -> value.stockItem().catalogItemId()).toList();
        Collection<Long> medicationIds = candidates.stream().map(value -> value.catalog().medication())
                .filter(java.util.Objects::nonNull).map(value -> value.id()).distinct().toList();
        Set<Long> matchedCatalogIds = searches.findMatchingTargetIds("CATALOG_ITEM", tenantId,
                site.organizationId(), site.departmentId(), query, catalogIds);
        Set<Long> matchedMedicationIds = searches.findMatchingTargetIds("MEDICATION", tenantId,
                site.organizationId(), site.departmentId(), query, medicationIds);
        String normalized = query.trim().toLowerCase(Locale.ROOT);
        int limit = searches.resolvePreference(tenantId, site.organizationId(), site.departmentId()).resultLimit();
        return candidates.stream().filter(value -> matchedCatalogIds.contains(value.stockItem().catalogItemId())
                        || value.catalog().medication() != null
                        && matchedMedicationIds.contains(value.catalog().medication().id())
                        || startsWith(value.catalog().item().code(), normalized)
                        || contains(value.catalog().itemPackage().packageSpec(), normalized)
                        || startsWith(value.catalog().itemPackage().unitCode(), normalized))
                .limit(limit).toList();
    }

    private Candidate candidate(StockSite site, StockItem stockItem, SupplierSupplyItem agreement, LocalDate date) {
        if (agreement == null || !agreement.effective(date)) return null;
        CatalogOperationalSnapshot catalog = catalogs.resolve(stockItem.tenantId(), stockItem.catalogItemId(),
                site.organizationId(), stockItem.basePackageId(), "PURCHASE", date);
        if (catalog.item() == null || catalog.itemPackage() == null || catalog.adoption() == null) return null;
        if (!"MED_PRODUCT".equals(catalog.item().itemType()) || !"ACTIVE".equals(catalog.item().status())
                || !catalog.item().stocked()) return null;
        if (catalog.item().validFrom().isAfter(date)
                || catalog.item().validTo() != null && catalog.item().validTo().isBefore(date)) return null;
        if (!"ACTIVE".equals(catalog.itemPackage().status())
                || catalog.itemPackage().validFrom().isAfter(date)
                || catalog.itemPackage().validTo() != null && catalog.itemPackage().validTo().isBefore(date)) {
            return null;
        }
        if (!"ACTIVE".equals(catalog.adoption().sdStatus()) || !catalog.adoption().purchasable()
                || !catalog.adoption().stocked()) return null;
        return new Candidate(stockItem, catalog, agreement);
    }

    private ProcurementCatalogOption option(Candidate value) {
        StockItem item = value.stockItem();
        CatalogOperationalSnapshot catalog = value.catalog();
        SupplierSupplyItem agreement = value.agreement();
        return new ProcurementCatalogOption(item.id(), item.revision(), item.stockSiteId(), item.catalogItemId(),
                item.basePackageId(), catalog.medication() == null ? null : catalog.medication().id(),
                catalog.item().code(), catalog.item().name(), catalog.itemPackage().unitCode(),
                catalog.itemPackage().unitName(), catalog.itemPackage().packageSpec(),
                catalog.itemPackage().quantityFactor(), item.baseUnitCode(), item.issuePolicy(),
                item.negativeAllowed(), item.lotRequired(), item.traceRequired(), item.splitAllowed(),
                item.coldChain(), item.controlled(), item.controlLevel(), item.highAlert(), item.status(),
                catalog.item().manufacturerName(), agreement.id(), agreement.agreementPrice(), agreement.taxRate());
    }

    private StockSite requireSite(Long tenantId, Long siteId, LocalDate date) {
        StockSite site = sites.findByIdAndTenantId(siteId, tenantId)
                .orElseThrow(() -> notFound("STOCK_SITE_NOT_FOUND", "未找到库房"));
        if (!site.effective(date)) throw conflict("STOCK_SITE_NOT_EFFECTIVE", "库房当前未启用");
        return site;
    }

    private Supplier requireSupplier(Long tenantId, Long supplierId, LocalDate date) {
        Supplier supplier = suppliers.findByIdAndTenantId(supplierId, tenantId)
                .orElseThrow(() -> notFound("SUPPLIER_NOT_FOUND", "未找到供应商"));
        if (!supplier.effective(date)) throw conflict("SUPPLIER_NOT_EFFECTIVE", "供应商资质无效、已过期或已停用");
        return supplier;
    }

    private boolean stockSiteIdMatches(StockSite site, StockItem item) {
        return site.id().equals(item.stockSiteId());
    }

    private boolean startsWith(String value, String query) {
        return value != null && value.toLowerCase(Locale.ROOT).startsWith(query);
    }

    private boolean contains(String value, String query) {
        return value != null && value.toLowerCase(Locale.ROOT).contains(query);
    }

    private record CatalogPackageKey(Long catalogItemId, Long packageId) {}
    private record Candidate(StockItem stockItem, CatalogOperationalSnapshot catalog,
                             SupplierSupplyItem agreement) {}
}
