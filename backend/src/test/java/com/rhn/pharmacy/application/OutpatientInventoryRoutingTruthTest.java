package com.rhn.pharmacy.application;

import com.rhn.outpatient.api.OutpatientPrescriptionInventoryDirectory.PrescriptionFreezeCommand;
import com.rhn.outpatient.api.OutpatientPrescriptionInventoryDirectory.PrescriptionItemFreezeRequest;
import com.rhn.pharmacy.domain.DispenseRoute;
import com.rhn.pharmacy.domain.StockSite;
import com.rhn.pharmacy.domain.StockItem;
import com.rhn.pharmacy.domain.InventoryBalance;
import com.rhn.pharmacy.domain.PrescriptionInventoryFreeze;
import com.rhn.pharmacy.infrastructure.*;
import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory;
import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory.CatalogOperationalSnapshot;
import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory.MedicationSnapshot;
import com.rhn.platform.masterdata.api.MasterDataViews;
import com.rhn.platform.search.api.SearchPreference;
import com.rhn.platform.search.api.SearchInputMode;
import com.rhn.platform.search.api.SearchMatchMode;
import com.rhn.platform.organization.api.OrganizationDirectory;
import com.rhn.platform.search.api.MasterDataSearchDirectory;
import com.rhn.shared.context.ExecutionContextProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class OutpatientInventoryRoutingTruthTest {
    private final DispenseRouteRepository routes = mock(DispenseRouteRepository.class);
    private final StockSiteRepository sites = mock(StockSiteRepository.class);
    private final StockItemRepository items = mock(StockItemRepository.class);
    private final InventoryAvailabilityService availability = mock(InventoryAvailabilityService.class);
    private final PrescriptionInventoryFreezeRepository freezes = mock(PrescriptionInventoryFreezeRepository.class);
    private final CatalogLifecycleDirectory catalogs = mock(CatalogLifecycleDirectory.class);
    private final MasterDataSearchDirectory search = mock(MasterDataSearchDirectory.class);
    private final DispenseRouteApplicationService routing = new DispenseRouteApplicationService(routes, sites,
            mock(OrganizationDirectory.class), mock(ExecutionContextProvider.class));
    private final OutpatientPrescriptionInventoryService service = new OutpatientPrescriptionInventoryService(
            routes, sites, items, availability, freezes, catalogs, search, routing);
    private final LocalDate today = LocalDate.now();

    @BeforeEach void catalog() {
        MedicationSnapshot medication = mock(MedicationSnapshot.class);
        when(medication.medicationType()).thenReturn("WESTERN");
        CatalogOperationalSnapshot snapshot = mock(CatalogOperationalSnapshot.class);
        when(snapshot.medication()).thenReturn(medication);
        when(catalogs.resolve(eq(1L), eq(101L), eq(2L), isNull(), eq("SALE"), any())).thenReturn(snapshot);
    }

    @Test void absentRouteDoesNotChooseAnExistingPharmacy() {
        assertThatThrownBy(() -> service.findOrderableMedications(1L, 2L, 3L, ""))
                .hasMessageContaining("发药路由");
        var inspected = service.inspectMedicationAvailability(1L, 2L, 3L, 101L, null);
        assertThat(inspected.routeConfigured()).isFalse();
        assertThat(inspected.stockSiteId()).isNull();
        assertThatThrownBy(() -> service.freezePrescription(command())).hasMessageContaining("发药路由");
        verifyNoInteractions(sites, items, availability, freezes);
    }

    @Test void medicationSpecificRouteWinsOverAnUnrelatedEarlierRoute() {
        StockSite western = site(2L, "OUTPATIENT"), herbal = site(2L, "OUTPATIENT");
        when(routes.findByTenantIdAndOrganizationIdOrderByCode(1L, 2L)).thenReturn(List.of(
                route("A-HERB", 3L, "HERBAL", herbal.id()), route("Z-WEST", null, "WESTERN", western.id())));
        var result = service.inspectMedicationAvailability(1L, 2L, 3L, 101L, null);
        assertThat(result.stockSiteId()).isEqualTo(western.id());
        assertThat(result.stockItemConfigured()).isFalse();
        verify(sites, never()).findByIdAndTenantId(herbal.id(), 1L);
    }

    @ParameterizedTest @ValueSource(booleans = {false, true})
    void orderableSearchUsesTheConfiguredPackageAndNeverTheFirstOrDefaultPackage(boolean exactPresent) {
        StockSite site = site(2L, "OUTPATIENT");
        when(routes.findByTenantIdAndOrganizationIdOrderByCode(1L, 2L)).thenReturn(List.of(route("WEST", 3L, null, site.id())));
        when(sites.findAllById(any())).thenReturn(List.of(site));
        when(search.resolvePreference(1L, 2L, 3L)).thenReturn(new SearchPreference(SearchInputMode.PINYIN, SearchMatchMode.PREFIX, .75, 20));
        StockItem item = new StockItem(1L, site.id(), 101L, 9L, "片", "FEFO", false, false, false, true, false, false, null, false, 1L);
        InventoryBalance balance = new InventoryBalance(1L, site.id(), 20L, item.id(), 30L, "AVAILABLE", "片");
        balance.receive(new BigDecimal("100"), BigDecimal.ONE);
        when(availability.findBySite(1L, site.id())).thenReturn(List.of(balance));
        when(items.findAllById(any())).thenReturn(List.of(item));
        var product = mock(MasterDataViews.MedicationProductView.class);
        when(product.id()).thenReturn(101L); when(product.unitCode()).thenReturn("片");
        var wrongDefault = new MasterDataViews.PackageView(8L, null, "BOX", "盒", "100片/盒", new BigDecimal("100"),
                "SALE", null, false, true, true, "ACTIVE", today.minusYears(1), null);
        var exact = new MasterDataViews.PackageView(9L, null, "BAG", "袋", "10片/袋", BigDecimal.TEN,
                "SALE", null, false, false, false, "ACTIVE", today.minusYears(1), null);
        when(product.packages()).thenReturn(exactPresent ? List.of(wrongDefault, exact) : List.of(wrongDefault));
        var medication = mock(MasterDataViews.MedicationView.class);
        when(medication.products()).thenReturn(List.of(product)); when(medication.sdMedicationType()).thenReturn("WESTERN");
        when(medication.name()).thenReturn("真实药品");
        when(catalogs.findMedicationsByProductCatalogItemIds(eq(1L), eq(2L), any())).thenReturn(List.of(medication));
        if (!exactPresent) assertThatThrownBy(() -> service.findOrderableMedications(1L, 2L, 3L, "")).hasMessageContaining("配置的包装未确认");
        else {
            var result = service.findOrderableMedications(1L, 2L, 3L, "");
            assertThat(result).hasSize(1);
            assertThat(result.getFirst().packageFactor()).isEqualByComparingTo("10");
            assertThat(result.getFirst().availablePackageQuantity()).isEqualByComparingTo("10");
            assertThat(result.getFirst().packageUnitName()).isEqualTo("袋");
        }
    }

    @Test void businessCandidatesRetainStockBelowOneConfiguredPackage() {
        StockSite site = site(2L, "OUTPATIENT");
        when(routes.findByTenantIdAndOrganizationIdOrderByCode(1L, 2L))
                .thenReturn(List.of(route("WEST", 3L, null, site.id())));
        when(sites.findAllById(any())).thenReturn(List.of(site));
        when(search.resolvePreference(1L, 2L, 3L))
                .thenReturn(new SearchPreference(SearchInputMode.PINYIN, SearchMatchMode.PREFIX, .75, 20));
        var item = new StockItem(1L, site.id(), 101L, 9L, "片", "FEFO", false,
                false, false, true, false, false, null, false, 1L);
        var balance = new InventoryBalance(1L, site.id(), 20L, item.id(), 30L, "AVAILABLE", "片");
        balance.receive(new BigDecimal("5"), BigDecimal.ONE);
        when(availability.findBySite(1L, site.id())).thenReturn(List.of(balance));
        when(items.findAllById(any())).thenReturn(List.of(item));
        var product = mock(MasterDataViews.MedicationProductView.class);
        when(product.id()).thenReturn(101L);
        when(product.unitCode()).thenReturn("片");
        when(product.packages()).thenReturn(List.of(new MasterDataViews.PackageView(9L, null,
                "BAG", "袋", "10片/袋", BigDecimal.TEN, "SALE", null, false, false, false,
                "ACTIVE", today.minusYears(1), null)));
        var medication = mock(MasterDataViews.MedicationView.class);
        when(medication.name()).thenReturn("真实药品");
        when(medication.sdMedicationType()).thenReturn("WESTERN");
        when(medication.products()).thenReturn(List.of(product));
        when(catalogs.findMedicationsByProductCatalogItemIds(eq(1L), eq(2L), any()))
                .thenReturn(List.of(medication));

        assertThat(service.findOrderableMedications(1L, 2L, 3L, "")).isEmpty();
        var candidates = service.findOrderableMedicationCandidates(1L, 2L, 3L, "");
        assertThat(candidates).hasSize(1);
        assertThat(candidates.getFirst().availableBaseQuantity()).isEqualByComparingTo("5");
        assertThat(candidates.getFirst().availablePackageQuantity()).isEqualByComparingTo("0.5");
        assertThat(candidates.getFirst().packageFactor()).isEqualByComparingTo("10");
        verifyNoInteractions(freezes);
    }

    @Test void missingExactProductDoesNotSubstituteAnotherStockItem() {
        StockSite site = site(2L, "OUTPATIENT");
        when(routes.findByTenantIdAndOrganizationIdOrderByCode(1L, 2L)).thenReturn(List.of(route("WEST", 3L, null, site.id())));
        assertThatThrownBy(() -> service.freezePrescription(command())).hasMessageContaining("未纳入该药品经营项目");
        verify(items).findByTenantIdAndStockSiteIdAndCatalogItemId(1L, site.id(), 101L);
        verify(items, never()).findByTenantIdAndStockSiteIdOrderById(any(), any());
        verify(catalogs, never()).findMedicationsByProductCatalogItemIds(any(), any(), any());
        verifyNoInteractions(availability, freezes);
    }

    @Test void exactBaseUnitAvailabilityIgnoresTheConfiguredStockPackage() {
        StockSite site = site(2L, "OUTPATIENT");
        when(routes.findByTenantIdAndOrganizationIdOrderByCode(1L, 2L))
                .thenReturn(List.of(route("WEST", 3L, null, site.id())));
        var item = new StockItem(1L, site.id(), 101L, 9L, "片", "FEFO", false,
                false, false, true, false, false, null, false, 1L);
        when(items.findByTenantIdAndStockSiteIdAndCatalogItemId(1L, site.id(), 101L)).thenReturn(Optional.of(item));
        var balance = new InventoryBalance(1L, site.id(), 20L, item.id(), 30L, "AVAILABLE", "片");
        balance.receive(new BigDecimal("100"), BigDecimal.ONE);
        when(availability.findByItem(1L, site.id(), item.id())).thenReturn(List.of(balance));
        var catalog = catalogs.resolve(1L, 101L, 2L, null, "SALE", today);
        var definition = mock(CatalogLifecycleDirectory.CatalogItemSnapshot.class);
        when(definition.unitCode()).thenReturn("片");
        when(catalog.item()).thenReturn(definition);

        var result = service.inspectMedicationAvailabilityForExactPackage(1L, 2L, 3L, 101L, null);

        assertThat(result.effectivePackageId()).isNull();
        assertThat(result.packageUnitCode()).isEqualTo("片");
        assertThat(result.packageFactor()).isEqualByComparingTo(BigDecimal.ONE);
        assertThat(result.availablePackageQuantity()).isEqualByComparingTo("100");
        verify(catalogs, never()).resolve(eq(1L), eq(101L), eq(2L), eq(9L), any(), any());
        verifyNoInteractions(freezes);
    }

    @ParameterizedTest @ValueSource(strings = {"", "同名药品"})
    void businessCandidatesIncludeItemsBeyondTheDisplayLimit(String query) {
        StockSite site = site(2L, "OUTPATIENT");
        when(routes.findByTenantIdAndOrganizationIdOrderByCode(1L, 2L))
                .thenReturn(List.of(route("WEST", 3L, null, site.id())));
        when(sites.findAllById(any())).thenReturn(List.of(site));
        when(search.resolvePreference(1L, 2L, 3L))
                .thenReturn(new SearchPreference(SearchInputMode.PINYIN, SearchMatchMode.PREFIX, .75, 20));
        var stockItems = new java.util.ArrayList<StockItem>();
        var balances = new java.util.ArrayList<InventoryBalance>();
        var medications = new java.util.ArrayList<MasterDataViews.MedicationView>();
        for (long id = 101; id < 122; id++) {
            var item = new StockItem(1L, site.id(), id, null, "片", "FEFO", false,
                    false, false, true, false, false, null, false, 1L);
            stockItems.add(item);
            var balance = new InventoryBalance(1L, site.id(), 20L, item.id(), 30L, "AVAILABLE", "片");
            balance.receive(BigDecimal.TEN, BigDecimal.ONE);
            balances.add(balance);
            var product = mock(MasterDataViews.MedicationProductView.class);
            when(product.id()).thenReturn(id);
            when(product.unitCode()).thenReturn("片");
            var medication = mock(MasterDataViews.MedicationView.class);
            when(medication.id()).thenReturn(id + 1000);
            when(medication.name()).thenReturn("同名药品");
            when(medication.sdMedicationType()).thenReturn("WESTERN");
            when(medication.products()).thenReturn(List.of(product));
            medications.add(medication);
        }
        when(availability.findBySite(1L, site.id())).thenReturn(balances);
        when(items.findAllById(any())).thenReturn(stockItems);
        when(catalogs.findMedicationsByProductCatalogItemIds(eq(1L), eq(2L), any())).thenReturn(medications);

        assertThat(service.findOrderableMedications(1L, 2L, 3L, query)).hasSize(20);
        clearInvocations(search);
        var all = service.findOrderableMedicationCandidates(1L, 2L, 3L, query);
        assertThat(all).hasSize(21);
        assertThat(all).extracting(value -> value.products().getFirst().id())
                .containsExactlyElementsOf(stockItems.stream().map(StockItem::catalogItemId).toList());
        assertThat(all).allSatisfy(value -> {
            assertThat(value.stockSiteId()).isEqualTo(site.id());
            assertThat(value.availablePackageQuantity()).isEqualByComparingTo(BigDecimal.TEN);
        });
        verify(search, never()).resolvePreference(any(), any(), any());
        verifyNoInteractions(freezes);
    }

    @Test void freezesEachMedicationAtItsActualTypeSpecificPharmacy() {
        StockSite western = site(2L, "OUTPATIENT"), herbal = site(2L, "OUTPATIENT");
        when(routes.findByTenantIdAndOrganizationIdOrderByCode(1L, 2L)).thenReturn(List.of(
                route("A-WEST", 3L, "WESTERN", western.id()), route("Z-HERB", 3L, "HERBAL", herbal.id())));
        MedicationSnapshot herbMedication = mock(MedicationSnapshot.class);
        when(herbMedication.medicationType()).thenReturn("HERBAL");
        CatalogOperationalSnapshot herbCatalog = mock(CatalogOperationalSnapshot.class);
        when(herbCatalog.medication()).thenReturn(herbMedication);
        when(catalogs.resolve(eq(1L), eq(102L), eq(2L), isNull(), eq("SALE"), any())).thenReturn(herbCatalog);
        InventoryBalance westernBalance = stocked(western, 101L), herbalBalance = stocked(herbal, 102L);
        var command = new PrescriptionFreezeCommand(1L, 2L, 3L, 4L, 5L, List.of(
                new PrescriptionItemFreezeRequest(6L, 101L, null, BigDecimal.ONE, "片", BigDecimal.ONE, "片"),
                new PrescriptionItemFreezeRequest(7L, 102L, null, BigDecimal.TWO, "片", BigDecimal.TWO, "片")), 8L);
        assertThat(service.freezePrescription(command).totalItemsFrozen()).isEqualTo(2);
        var saved = org.mockito.ArgumentCaptor.forClass(PrescriptionInventoryFreeze.class);
        verify(freezes, times(2)).save(saved.capture());
        assertThat(saved.getAllValues()).extracting(PrescriptionInventoryFreeze::stockSiteId)
                .containsExactly(western.id(), herbal.id());
        assertThat(westernBalance.quantityFrozen()).isEqualByComparingTo(BigDecimal.ONE);
        assertThat(herbalBalance.quantityFrozen()).isEqualByComparingTo(BigDecimal.TWO);
    }

    @Test void freezesSavedBaseQuantityInsteadOfRecalculatingWithTheCurrentPackage() {
        StockSite site = site(2L, "OUTPATIENT");
        when(routes.findByTenantIdAndOrganizationIdOrderByCode(1L, 2L)).thenReturn(List.of(route("WEST", 3L, null, site.id())));
        InventoryBalance balance = stocked(site, 101L);
        CatalogOperationalSnapshot snapshot = catalogs.resolve(1L, 101L, 2L, null, "SALE", today);
        when(snapshot.itemPackage()).thenReturn(new CatalogLifecycleDirectory.PackageSnapshot(9L, "BOX", "盒", null,
                new BigDecimal("100"), "SALE", "ACTIVE", today.minusYears(1), null));
        var command = new PrescriptionFreezeCommand(1L, 2L, 3L, 4L, 5L, List.of(
                new PrescriptionItemFreezeRequest(6L, 101L, null, BigDecimal.ONE, "盒", new BigDecimal("3"), "片")), 8L);
        service.freezePrescription(command);
        assertThat(balance.quantityFrozen()).isEqualByComparingTo("3");
    }

    @ParameterizedTest @ValueSource(strings = {"missing", "zero", "negative", "precision", "unit"})
    void incompleteSavedQuantityDoesNotTriggerStockMutation(String defect) {
        StockSite site = site(2L, "OUTPATIENT");
        when(routes.findByTenantIdAndOrganizationIdOrderByCode(1L, 2L)).thenReturn(List.of(route("WEST", 3L, null, site.id())));
        InventoryBalance balance = stocked(site, 101L);
        BigDecimal base = switch (defect) {
            case "missing" -> null;
            case "zero" -> BigDecimal.ZERO;
            case "negative" -> BigDecimal.ONE.negate();
            case "precision" -> new BigDecimal("0.000000001");
            default -> BigDecimal.ONE;
        };
        var command = new PrescriptionFreezeCommand(1L, 2L, 3L, 4L, 5L, List.of(
                new PrescriptionItemFreezeRequest(6L, 101L, null, BigDecimal.ONE, "盒", base,
                        "unit".equals(defect) ? "盒" : "片")), 8L);
        assertThatThrownBy(() -> service.freezePrescription(command)).hasMessageContaining("数量或单位快照");
        assertThat(balance.quantityFrozen()).isEqualByComparingTo(BigDecimal.ZERO);
        verifyNoInteractions(freezes);
    }

    private InventoryBalance stocked(StockSite site, Long catalogId) {
        StockItem item = new StockItem(1L, site.id(), catalogId, null, "片", "FEFO", false,
                false, false, true, false, false, null, false, 1L);
        when(items.findByTenantIdAndStockSiteIdAndCatalogItemId(1L, site.id(), catalogId)).thenReturn(Optional.of(item));
        InventoryBalance balance = new InventoryBalance(1L, site.id(), 20L, item.id(), 30L, "AVAILABLE", "片");
        balance.receive(BigDecimal.TEN, BigDecimal.ONE);
        when(availability.lockIssuable(eq(1L), eq(site.id()), eq(item.id()), any(), eq("FEFO"))).thenReturn(List.of(balance));
        return balance;
    }

    @ParameterizedTest @ValueSource(strings = {"INPATIENT", "INVENTORY", "OTHER_ORG", "INACTIVE"})
    void unusableSpecificRouteDoesNotFallBackToAGenericPharmacy(String defect) {
        StockSite fallback = site(2L, "OUTPATIENT");
        StockSite specific = site("OTHER_ORG".equals(defect) ? 9L : 2L,
                List.of("INPATIENT", "INVENTORY").contains(defect) ? defect : "OUTPATIENT");
        if ("INACTIVE".equals(defect)) specific.synchronizeDepartment("PH", "停用药房", "PHARMACY", "OUTPATIENT",
                false, today.minusYears(1), null, 1L);
        when(routes.findByTenantIdAndOrganizationIdOrderByCode(1L, 2L)).thenReturn(List.of(
                route("DEFAULT", null, null, fallback.id()), route("SPECIFIC", 3L, "WESTERN", specific.id())));
        assertThatThrownBy(() -> service.inspectMedicationAvailability(1L, 2L, 3L, 101L, null)).hasMessageContaining("不可用");
        assertThatThrownBy(() -> service.freezePrescription(command())).hasMessageContaining("不可用");
        verify(sites, never()).findByIdAndTenantId(fallback.id(), 1L);
        verifyNoInteractions(items, availability, freezes);
    }

    @Test void ambiguousRoutesAreNotResolvedByCodeOrder() {
        StockSite left = site(2L, "OUTPATIENT"), right = site(2L, "OUTPATIENT");
        when(routes.findByTenantIdAndOrganizationIdOrderByCode(1L, 2L)).thenReturn(List.of(
                route("A", 3L, "WESTERN", left.id()), route("B", 3L, "WESTERN", right.id())));
        assertThatThrownBy(() -> service.inspectMedicationAvailability(1L, 2L, 3L, 101L, null)).hasMessageContaining("多条同优先级");
        verifyNoInteractions(items, availability, freezes);
    }

    private StockSite site(Long org, String scope) {
        StockSite site = new StockSite(1L, org, 3L, "PH", "真实药房", "PHARMACY", scope, today.minusYears(1), null, 1L);
        when(sites.findByIdAndTenantId(site.id(), 1L)).thenReturn(Optional.of(site));
        return site;
    }
    private DispenseRoute route(String code, Long dept, String type, Long site) {
        return new DispenseRoute(1L, 2L, code, code, "OUTPATIENT", dept, type, site, true, today.minusYears(1), null, null, 1L);
    }
    private PrescriptionFreezeCommand command() {
        return new PrescriptionFreezeCommand(1L, 2L, 3L, 4L, 5L,
                List.of(new PrescriptionItemFreezeRequest(6L, 101L, null, BigDecimal.ONE, "片", BigDecimal.ONE, "片")), 7L);
    }
}
