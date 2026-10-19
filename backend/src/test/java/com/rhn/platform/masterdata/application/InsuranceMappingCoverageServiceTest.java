package com.rhn.platform.masterdata.application;

import com.rhn.platform.masterdata.api.InsuranceCoverageViews.CoverageItem;
import com.rhn.platform.masterdata.api.StandardMappingViews.ItemTermMappingView;
import com.rhn.platform.masterdata.infrastructure.MedicationProductRepository;
import com.rhn.platform.masterdata.infrastructure.ServiceCatalogItemRepository;
import com.rhn.platform.masterdata.infrastructure.SupplyItemRepository;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class InsuranceMappingCoverageServiceTest {
    static final LocalDate AT = LocalDate.of(2026, 10, 18);
    MedicationProductRepository drugs = mock(MedicationProductRepository.class);
    ServiceCatalogItemRepository services = mock(ServiceCatalogItemRepository.class);
    SupplyItemRepository supplies = mock(SupplyItemRepository.class);
    ItemStandardMappingService mappings = mock(ItemStandardMappingService.class);
    InsuranceMappingCoverageService service;

    static ItemTermMappingView mapping(long id, long target, String code, String status, String equivalence,
                                       LocalDate from, LocalDate to) {
        return new ItemTermMappingView(id, 0, 1L, "CATALOG_ITEM", target, id, 1L, "SYS-A", "医保目录", "2026",
                "INSURANCE", code, code, "INSURANCE", equivalence, true, null, from, to, status, null,
                Instant.EPOCH, 1L, Instant.EPOCH, 1L);
    }

    @BeforeEach
    void setup() {
        var provider = mock(ExecutionContextProvider.class);
        when(provider.requireCurrent()).thenReturn(new ExecutionContext(1L, 9L, "admin", "C", Set.of()));
        service = new InsuranceMappingCoverageService(drugs, services, supplies, mappings, provider);
        when(drugs.findChargeableRefs(eq(1L), any())).thenReturn(List.of(
                new Object[]{1L, "D1", "阿莫西林"}, new Object[]{2L, "D2", "头孢"}, new Object[]{3L, "D3", "=恶意名称"}));
        when(services.findChargeableRefs(eq(1L), any())).thenReturn(List.<Object[]>of(new Object[]{4L, "S1", "挂号费"}));
        when(supplies.findChargeableRefs(eq(1L), any())).thenReturn(List.<Object[]>of(new Object[]{5L, "M1", "注射器"}));
        var start = LocalDate.of(2026, 1, 1);
        when(mappings.insuranceMappingHistory(eq(1L), anyCollection())).thenReturn(Map.of(
                1L, List.of(mapping(11, 1, "X001", "ACTIVE", "EXACT", start, null)),
                2L, List.of(mapping(21, 2, "X002", "ACTIVE", "EXACT", start, null), mapping(22, 2, "X003", "ACTIVE", "EQUIVALENT", start, null)),
                3L, List.of(mapping(31, 3, "X004", "ACTIVE", "EXACT", start, LocalDate.of(2026, 6, 30))),
                4L, List.of(mapping(41, 4, "F001", "ACTIVE", "WIDER", start, null))));
    }

    @Test
    void classifiesUniqueAmbiguousExpiredAndUnmappedItemsAndComputesRates() {
        var report = service.report("SYS-A", null, null, null, AT, 0, 50);

        Map<String, String> status = new java.util.HashMap<>();
        report.items().forEach(item -> status.put(item.code(), item.status()));
        assertThat(status).containsEntry("D1", "MAPPED").containsEntry("D2", "AMBIGUOUS").containsEntry("D3", "EXPIRED")
                .containsEntry("S1", "UNMAPPED").containsEntry("M1", "UNMAPPED");
        var drug = report.summary().getFirst();
        assertThat(drug.category()).isEqualTo("DRUG");
        assertThat(drug.categoryText()).isEqualTo("药品");
        assertThat(report.items().getFirst().statusText()).isNotBlank();
        assertThat(drug.total()).isEqualTo(3);
        assertThat(drug.mapped()).isEqualTo(1);
        assertThat(drug.coverageRate()).isEqualByComparingTo("33.3");
        assertThat(report.summary().get(1).coverageRate()).isEqualByComparingTo("0.0");
    }

    @Test
    void mappingsFromOtherCatalogSystemsDoNotCount() {
        var report = service.report("SYS-OTHER", "DRUG", null, null, AT, 0, 50);
        assertThat(report.items()).allMatch(item -> item.status().equals("UNMAPPED"));
    }

    @Test
    void filtersAndPaginatesWithoutLosingTheOverallSummary() {
        var report = service.report("SYS-A", null, "UNMAPPED", null, AT, 0, 1);
        assertThat(report.total()).isEqualTo(2);
        assertThat(report.items()).hasSize(1);
        assertThat(report.summary().stream().mapToInt(s -> s.total()).sum()).isEqualTo(5);
        assertThat(service.report("SYS-A", null, null, "注射", AT, 0, 10).items()).extracting(CoverageItem::code).containsExactly("M1");
        assertThatThrownBy(() -> service.report(null, "BAD", null, null, AT, 0, 10)).hasMessageContaining("类别");
        assertThatThrownBy(() -> service.report(null, null, null, null, AT, 0, 1000)).hasMessageContaining("分页");
    }

    @Test
    void csvExportNeutralisesFormulaInjectionAndKeepsFilters() {
        String csv = service.exportCsv("SYS-A", "DRUG", "EXPIRED", null, AT);
        assertThat(csv).startsWith("﻿类别,");
        assertThat(csv).contains("\"'=恶意名称\"").contains("\"已过期\"").doesNotContain("阿莫西林");
        assertThat(InsuranceMappingCoverageService.csv("a\"b")).isEqualTo("\"a\"\"b\"");
    }
}
