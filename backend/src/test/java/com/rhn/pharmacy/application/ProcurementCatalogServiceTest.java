package com.rhn.pharmacy.application;

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
import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory.CatalogItemSnapshot;
import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory.CatalogOperationalSnapshot;
import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory.PackageSnapshot;
import com.rhn.platform.masterdata.api.MasterDataViews.OrganizationAdoptionView;
import com.rhn.platform.search.api.MasterDataSearchDirectory;
import com.rhn.platform.search.api.SearchInputMode;
import com.rhn.platform.search.api.SearchMatchMode;
import com.rhn.platform.search.api.SearchPreference;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ProcurementCatalogServiceTest {
    private static final Long TENANT = 1L;
    private static final Long ORGANIZATION = 2L;
    private static final Long ACTOR = 3L;
    private static final LocalDate TODAY = LocalDate.of(2026, 9, 20);

    @Mock StockSiteRepository sites;
    @Mock StockItemRepository stockItems;
    @Mock SupplierRepository suppliers;
    @Mock SupplierSupplyItemRepository supplyItems;
    @Mock PurchaseOrderRepository orders;
    @Mock PurchaseOrderLineRepository orderLines;
    @Mock CatalogLifecycleDirectory catalogs;
    @Mock MasterDataSearchDirectory searches;

    private ProcurementCatalogService service;
    private StockSite site;
    private Supplier supplier;

    @BeforeEach
    void setUp() {
        service = new ProcurementCatalogService(sites, stockItems, suppliers, supplyItems, orders, orderLines,
                catalogs, searches);
        site = new StockSite(TENANT, ORGANIZATION, 20L, "WH", "药库", "WAREHOUSE", "INVENTORY",
                TODAY.minusYears(1), null, ACTOR);
        supplier = new Supplier(TENANT, ORGANIZATION, "SUP", "供应商", null, "LIC",
                TODAY.plusYears(1), null, null, TODAY.minusYears(1), null, ACTOR);
        lenient().when(sites.findByIdAndTenantId(site.id(), TENANT)).thenReturn(Optional.of(site));
        lenient().when(searches.resolvePreference(TENANT, ORGANIZATION, site.departmentId())).thenReturn(
                new SearchPreference(SearchInputMode.PINYIN, SearchMatchMode.PREFIX, 0.75, 30));
    }

    @Test
    void plannedProcurementRequiresEffectiveAgreementAndPurchasableAdoption() {
        when(suppliers.findByIdAndTenantId(supplier.id(), TENANT)).thenReturn(Optional.of(supplier));
        StockItem eligible = stockItem(101L, 201L);
        StockItem missingAgreement = stockItem(102L, 202L);
        StockItem notPurchasable = stockItem(103L, 203L);
        when(stockItems.findByTenantIdAndStockSiteIdOrderById(TENANT, site.id()))
                .thenReturn(List.of(eligible, missingAgreement, notPurchasable));

        SupplierSupplyItem eligibleAgreement = agreement(eligible);
        SupplierSupplyItem notPurchasableAgreement = agreement(notPurchasable);
        when(supplyItems.findByTenantIdAndSupplierIdOrderById(TENANT, supplier.id()))
                .thenReturn(List.of(eligibleAgreement, notPurchasableAgreement));
        when(catalogs.resolve(TENANT, eligible.catalogItemId(), ORGANIZATION, eligible.basePackageId(),
                "PURCHASE", TODAY)).thenReturn(snapshot(eligible, true, true));
        when(catalogs.resolve(TENANT, notPurchasable.catalogItemId(), ORGANIZATION,
                notPurchasable.basePackageId(), "PURCHASE", TODAY)).thenReturn(snapshot(notPurchasable, false, true));

        var result = service.searchPurchasable(TENANT, site.id(), supplier.id(), "", TODAY);

        assertThat(result).extracting(value -> value.catalogItemId()).containsExactly(eligible.catalogItemId());
        verify(catalogs, never()).resolve(eq(TENANT), eq(missingAgreement.catalogItemId()), eq(ORGANIZATION),
                eq(missingAgreement.basePackageId()), eq("PURCHASE"), eq(TODAY));
    }

    @Test
    void plannedProcurementExcludesExpiredAgreement() {
        when(suppliers.findByIdAndTenantId(supplier.id(), TENANT)).thenReturn(Optional.of(supplier));
        StockItem item = stockItem(104L, 204L);
        SupplierSupplyItem expired = new SupplierSupplyItem(TENANT, supplier.id(), item.catalogItemId(),
                item.basePackageId(), BigDecimal.TEN, new BigDecimal("0.13"), TODAY.minusYears(2),
                TODAY.minusDays(1), ACTOR);
        when(stockItems.findByTenantIdAndStockSiteIdOrderById(TENANT, site.id())).thenReturn(List.of(item));
        when(supplyItems.findByTenantIdAndSupplierIdOrderById(TENANT, supplier.id())).thenReturn(List.of(expired));

        assertThat(service.searchPurchasable(TENANT, site.id(), supplier.id(), "", TODAY)).isEmpty();
        verify(catalogs, never()).resolve(any(), any(), any(), any(), any(), any());
    }

    @Test
    void receiptSearchReturnsOnlyUnfinishedLinesFromReceivableOrder() {
        PurchaseOrder order = new PurchaseOrder(TENANT, ORGANIZATION, site.id(), 30L, "PO-1", "REQ-1",
                TODAY, TODAY.plusDays(1), null, ACTOR);
        order.submit(ACTOR);
        order.approve(ACTOR, null);
        when(orders.findByIdAndTenantId(order.id(), TENANT)).thenReturn(Optional.of(order));

        StockItem completedItem = stockItem(105L, 205L);
        StockItem openItem = stockItem(106L, 206L);
        PurchaseOrderLine completed = line(order, completedItem, 1);
        completed.recordReceipt(new BigDecimal("10"));
        PurchaseOrderLine open = line(order, openItem, 2);
        open.recordReceipt(new BigDecimal("4"));
        when(orderLines.findByTenantIdAndPurchaseOrderIdOrderBySortOrder(TENANT, order.id()))
                .thenReturn(List.of(completed, open));
        when(stockItems.findAllById(any())).thenReturn(List.of(openItem));

        SupplierSupplyItem agreement = new SupplierSupplyItem(TENANT, order.supplierId(), openItem.catalogItemId(),
                openItem.basePackageId(), BigDecimal.TEN, new BigDecimal("0.13"), TODAY.minusYears(1), null, ACTOR);
        when(supplyItems.findByTenantIdAndSupplierIdOrderById(TENANT, order.supplierId()))
                .thenReturn(List.of(agreement));
        when(catalogs.resolve(TENANT, openItem.catalogItemId(), ORGANIZATION, openItem.basePackageId(),
                "PURCHASE", TODAY)).thenReturn(snapshot(openItem, true, true));

        var result = service.searchReceivableOrderLines(TENANT, order.id(), "", TODAY);

        assertThat(result).hasSize(1);
        assertThat(result.getFirst().purchaseOrderLineId()).isEqualTo(open.id());
        assertThat(result.getFirst().remainingQuantity()).isEqualByComparingTo("6");
    }

    @Test
    void receiptSearchRejectsNonReceivableOrderStates() {
        PurchaseOrder draft = new PurchaseOrder(TENANT, ORGANIZATION, site.id(), 30L, "PO-2", "REQ-2",
                TODAY, null, null, ACTOR);
        when(orders.findByIdAndTenantId(draft.id(), TENANT)).thenReturn(Optional.of(draft));

        assertThat(service.searchReceivableOrderLines(TENANT, draft.id(), "", TODAY)).isEmpty();
        verify(orderLines, never()).findByTenantIdAndPurchaseOrderIdOrderBySortOrder(any(), any());
    }

    private StockItem stockItem(Long catalogItemId, Long packageId) {
        return new StockItem(TENANT, site.id(), catalogItemId, packageId, "BOX", "FIFO", false,
                true, true, false, false, false, null, false, ACTOR);
    }

    private SupplierSupplyItem agreement(StockItem item) {
        return new SupplierSupplyItem(TENANT, supplier.id(), item.catalogItemId(), item.basePackageId(),
                BigDecimal.TEN, new BigDecimal("0.13"), TODAY.minusYears(1), null, ACTOR);
    }

    private PurchaseOrderLine line(PurchaseOrder order, StockItem item, int sortOrder) {
        return new PurchaseOrderLine(TENANT, order.id(), sortOrder, item.id(), item.basePackageId(),
                new BigDecimal("10"), BigDecimal.TEN, new BigDecimal("0.13"), null);
    }

    private CatalogOperationalSnapshot snapshot(StockItem stockItem, boolean purchasable, boolean stocked) {
        CatalogItemSnapshot item = new CatalogItemSnapshot(stockItem.catalogItemId(), 1L, "MED_PRODUCT", 501L,
                "P-" + stockItem.catalogItemId(), "测试药品", "BOX", true, true, true, "ACTIVE",
                TODAY.minusYears(1), null, null, null, null, 601L, "测试厂家");
        PackageSnapshot itemPackage = new PackageSnapshot(stockItem.basePackageId(), "BOX", "盒", "10片/盒",
                BigDecimal.TEN, "PURCHASE", "ACTIVE", TODAY.minusYears(1), null);
        OrganizationAdoptionView adoption = new OrganizationAdoptionView(701L, 0, ORGANIZATION,
                stockItem.catalogItemId(), null, null, null, true, false, true, purchasable, stocked,
                true, true, "ACTIVE", TODAY.minusYears(1), null, null);
        return new CatalogOperationalSnapshot(stockItem.catalogItemId(), ORGANIZATION, stockItem.basePackageId(),
                "PURCHASE", TODAY, item, itemPackage, null, adoption, null);
    }
}
