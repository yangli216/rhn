package com.rhn.ai.application;

import com.rhn.outpatient.api.OutpatientPrescriptionInventoryDirectory;
import com.rhn.platform.masterdata.api.MasterDataViews.MedicationProductView;
import com.rhn.platform.masterdata.api.MasterDataViews.PackageView;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class MedicationCandidateMatchingServiceTest {
    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.CsvSource({"10mg,NEEDS_REVIEW", "5.00 mg,UNIQUE_MATCH", ",NEEDS_REVIEW"})
    void explicitStrengthMustMatchConfirmedCatalogSpecification(String catalogSpec, MedicationCandidateMatchingService.Status expected) {
        var inventory = mock(OutpatientPrescriptionInventoryDirectory.class);
        var itemPackage = mock(PackageView.class);
        when(itemPackage.id()).thenReturn(20L);
        when(itemPackage.unitCode()).thenReturn("BOX");
        when(itemPackage.unitName()).thenReturn("盒");
        when(itemPackage.sdStatus()).thenReturn("ACTIVE");
        var product = product(10L, "氨氯地平片" + (catalogSpec == null ? "" : " " + catalogSpec));
        when(product.packages()).thenReturn(List.of(itemPackage));
        var medication = medication("氨氯地平片", List.of(product));
        when(medication.preparationSpec()).thenReturn(catalogSpec);
        when(inventory.findOrderableMedicationCandidates(1L, 2L, 3L, "氨氯地平片"))
                .thenReturn(List.of(medication));
        when(inventory.inspectMedicationAvailability(1L, 2L, 3L, 10L, 20L)).thenReturn(
                new OutpatientPrescriptionInventoryDirectory.MedicationAvailabilityView(true, 1L, "门诊药房",
                        true, 2L, 20L, "BOX", BigDecimal.TEN, BigDecimal.TEN, BigDecimal.ONE));
        var intent = new MedicationIntentParser().parse("氨氯地平片 5mg", "每次5mg 口服 qd 共1盒");

        var result = new MedicationCandidateMatchingService(inventory).match(1L, 2L, 3L, intent);

        assertEquals(expected, result.status());
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.CsvSource({
            "5,0.5,10,NEEDS_REVIEW", "15,1.5,10,NEEDS_REVIEW", "20,2,10,UNIQUE_MATCH",
            "20,,10,NEEDS_REVIEW", "20,2,,NEEDS_REVIEW", "20,2,0,NEEDS_REVIEW",
            "5,2,10,NEEDS_REVIEW", "20,0.5,10,NEEDS_REVIEW"})
    void uniqueMatchRequiresEnoughStockForTheActualRequestedQuantity(
            BigDecimal baseQuantity, BigDecimal packageQuantity, BigDecimal factor,
            MedicationCandidateMatchingService.Status expected) {
        var inventory = mock(OutpatientPrescriptionInventoryDirectory.class);
        var itemPackage = mock(PackageView.class);
        when(itemPackage.id()).thenReturn(20L);
        when(itemPackage.unitCode()).thenReturn("BOX");
        when(itemPackage.unitName()).thenReturn("盒");
        when(itemPackage.sdStatus()).thenReturn("ACTIVE");
        var product = product(10L, "氨氯地平片");
        when(product.packages()).thenReturn(List.of(itemPackage));
        var candidate = medication("氨氯地平片", List.of(product));
        when(inventory.findOrderableMedicationCandidates(1L, 2L, 3L, "氨氯地平片"))
                .thenReturn(List.of(candidate));
        when(inventory.inspectMedicationAvailability(1L, 2L, 3L, 10L, 20L)).thenReturn(
                new OutpatientPrescriptionInventoryDirectory.MedicationAvailabilityView(true, 1L, "门诊药房",
                        true, 2L, 20L, "BOX", factor, baseQuantity, packageQuantity));
        var intent = new MedicationIntentParser().parse("氨氯地平片", "每次5mg 口服 qd 共2盒");

        assertEquals(expected, new MedicationCandidateMatchingService(inventory).match(1L, 2L, 3L, intent).status());
    }

    @Test
    void full_candidate_query_prevents_unique_match_from_a_truncated_display_result() {
        var inventory = mock(OutpatientPrescriptionInventoryDirectory.class);
        var first = medication("氨氯地平片", List.of(product(10L, "氨氯地平片")));
        var later = medication("氨氯地平片", List.of(product(11L, "氨氯地平片")));
        when(inventory.findOrderableMedications(1L, 2L, 3L, "氨氯地平片"))
                .thenReturn(List.of(first));
        when(inventory.findOrderableMedicationCandidates(1L, 2L, 3L, "氨氯地平片"))
                .thenReturn(List.of(first, later));

        var intent = new MedicationIntentParser().parse("氨氯地平片", "每次5mg 口服 qd 共1盒");
        var result = new MedicationCandidateMatchingService(inventory).match(1L, 2L, 3L, intent);

        assertEquals(MedicationCandidateMatchingService.Status.AMBIGUOUS, result.status());
        org.mockito.Mockito.verify(inventory, org.mockito.Mockito.never())
                .findOrderableMedications(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(),
                        org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
    }

    @Test
    void multiple_products_are_never_silently_selected() {
        var inventory = mock(OutpatientPrescriptionInventoryDirectory.class);
        var medication = medication("硝苯地平控释片", List.of(product(10L, "硝苯地平控释片 30mg"),
                product(11L, "硝苯地平控释片 60mg")));
        when(inventory.findOrderableMedicationCandidates(1L, 2L, 3L, "硝苯地平控释片"))
                .thenReturn(List.of(medication));

        var intent = new MedicationIntentParser().parse("硝苯地平控释片", "每次30mg 口服 qd 共1盒");
        var result = new MedicationCandidateMatchingService(inventory).match(1L, 2L, 3L, intent);

        assertEquals(MedicationCandidateMatchingService.Status.AMBIGUOUS, result.status());
    }

    @Test
    void unique_three_layer_match_still_requires_explicit_directions() {
        var inventory = mock(OutpatientPrescriptionInventoryDirectory.class);
        var itemPackage = mock(PackageView.class);
        when(itemPackage.id()).thenReturn(20L);
        when(itemPackage.unitCode()).thenReturn("BOX");
        when(itemPackage.unitName()).thenReturn("盒");
        when(itemPackage.sdStatus()).thenReturn("ACTIVE");
        var product = product(10L, "氨氯地平片");
        when(product.packages()).thenReturn(List.of(itemPackage));
        var medication = medication("氨氯地平片", List.of(product));
        when(inventory.findOrderableMedicationCandidates(1L, 2L, 3L, "氨氯地平片"))
                .thenReturn(List.of(medication));
        when(inventory.inspectMedicationAvailability(1L, 2L, 3L, 10L, 20L)).thenReturn(
                new OutpatientPrescriptionInventoryDirectory.MedicationAvailabilityView(true, 1L, "门诊药房",
                        true, 2L, 20L, "BOX", BigDecimal.TEN, BigDecimal.TEN, BigDecimal.ONE));

        var complete = new MedicationIntentParser().parse("氨氯地平片", "每次5mg 口服 qd 共1盒");
        var missing = new MedicationIntentParser().parse("氨氯地平片", "共1盒");
        MedicationCandidateMatchingService service = new MedicationCandidateMatchingService(inventory);

        assertEquals(MedicationCandidateMatchingService.Status.UNIQUE_MATCH,
                service.match(1L, 2L, 3L, complete).status());
        assertEquals(MedicationCandidateMatchingService.Status.NEEDS_REVIEW,
                service.match(1L, 2L, 3L, missing).status());
    }

    @Test
    void split_capsule_and_tablet_distinct_masters_match_directly() {
        var inventory = mock(OutpatientPrescriptionInventoryDirectory.class);
        var capPackage = mock(PackageView.class);
        when(capPackage.id()).thenReturn(31L);
        when(capPackage.unitCode()).thenReturn("BOX");
        when(capPackage.unitName()).thenReturn("盒");
        when(capPackage.sdStatus()).thenReturn("ACTIVE");

        var tabPackage = mock(PackageView.class);
        when(tabPackage.id()).thenReturn(32L);
        when(tabPackage.unitCode()).thenReturn("BOX");
        when(tabPackage.unitName()).thenReturn("盒");
        when(tabPackage.sdStatus()).thenReturn("ACTIVE");

        var capProduct = product(21L, "布洛芬缓释胶囊 0.3g*20粒/盒");
        when(capProduct.packages()).thenReturn(List.of(capPackage));
        var capMed = medication("布洛芬缓释胶囊", List.of(capProduct));

        var tabProduct = product(22L, "布洛芬缓释片 0.3g*20片/盒");
        when(tabProduct.packages()).thenReturn(List.of(tabPackage));
        var tabMed = medication("布洛芬缓释片", List.of(tabProduct));

        when(inventory.findOrderableMedicationCandidates(1L, 2L, 3L, "布洛芬缓释胶囊"))
                .thenReturn(List.of(capMed));
        when(inventory.inspectMedicationAvailability(1L, 2L, 3L, 21L, 31L)).thenReturn(
                new OutpatientPrescriptionInventoryDirectory.MedicationAvailabilityView(true, 1L, "门诊药房",
                        true, 2L, 31L, "BOX", BigDecimal.TEN, BigDecimal.TEN, BigDecimal.ONE));

        when(inventory.findOrderableMedicationCandidates(1L, 2L, 3L, "布洛芬缓释片"))
                .thenReturn(List.of(tabMed));
        when(inventory.inspectMedicationAvailability(1L, 2L, 3L, 22L, 32L)).thenReturn(
                new OutpatientPrescriptionInventoryDirectory.MedicationAvailabilityView(true, 1L, "门诊药房",
                        true, 2L, 32L, "BOX", BigDecimal.TEN, BigDecimal.TEN, BigDecimal.ONE));

        var service = new MedicationCandidateMatchingService(inventory);

        var capIntent = new MedicationIntentParser().parse("布洛芬缓释胶囊", "每次0.3g 口服 bid 共1盒");
        var capResult = service.match(1L, 2L, 3L, capIntent);
        assertEquals(MedicationCandidateMatchingService.Status.UNIQUE_MATCH, capResult.status());
        assertEquals("布洛芬缓释胶囊", capResult.medication().name());

        var tabIntent = new MedicationIntentParser().parse("布洛芬缓释片", "每次0.3g 口服 bid 共1盒");
        var tabResult = service.match(1L, 2L, 3L, tabIntent);
        assertEquals(MedicationCandidateMatchingService.Status.UNIQUE_MATCH, tabResult.status());
        assertEquals("布洛芬缓释片", tabResult.medication().name());
    }

    @Test
    void compound_dosage_form_parentheses_matches_generic_intent() {
        var inventory = mock(OutpatientPrescriptionInventoryDirectory.class);
        var itemPackage = mock(PackageView.class);
        when(itemPackage.id()).thenReturn(30L);
        when(itemPackage.unitCode()).thenReturn("BOX");
        when(itemPackage.unitName()).thenReturn("盒");
        when(itemPackage.sdStatus()).thenReturn("ACTIVE");
        var product = product(15L, "布洛芬缓释胶囊 0.3g*20粒/盒");
        when(product.packages()).thenReturn(List.of(itemPackage));
        var medication = medication("布洛芬缓释（片剂、胶囊）", List.of(product));

        when(inventory.findOrderableMedicationCandidates(1L, 2L, 3L, "布洛芬缓释胶囊"))
                .thenReturn(List.of(medication));
        when(inventory.inspectMedicationAvailability(1L, 2L, 3L, 15L, 30L)).thenReturn(
                new OutpatientPrescriptionInventoryDirectory.MedicationAvailabilityView(true, 1L, "门诊药房",
                        true, 2L, 30L, "BOX", BigDecimal.TEN, BigDecimal.TEN, BigDecimal.ONE));

        var intent = new MedicationIntentParser().parse("布洛芬缓释胶囊", "每次0.3g 口服 bid 共1盒");
        var service = new MedicationCandidateMatchingService(inventory);
        var result = service.match(1L, 2L, 3L, intent);

        assertEquals(MedicationCandidateMatchingService.Status.UNIQUE_MATCH, result.status());
        assertEquals("布洛芬缓释（片剂、胶囊）", result.medication().name());
    }

    @Test
    void compound_dosage_form_matches_via_stem_relaxed_recall() {
        var inventory = mock(OutpatientPrescriptionInventoryDirectory.class);
        var itemPackage = mock(PackageView.class);
        when(itemPackage.id()).thenReturn(30L);
        when(itemPackage.unitCode()).thenReturn("BOX");
        when(itemPackage.unitName()).thenReturn("盒");
        when(itemPackage.sdStatus()).thenReturn("ACTIVE");
        var product = product(15L, "布洛芬缓释胶囊 0.3g*20粒/盒");
        when(product.packages()).thenReturn(List.of(itemPackage));
        var medication = medication("布洛芬缓释（片剂、胶囊）", List.of(product));

        // Direct search returns empty, but stem "布洛芬缓释" returns compound entry
        when(inventory.findOrderableMedicationCandidates(1L, 2L, 3L, "布洛芬缓释胶囊"))
                .thenReturn(List.of());
        when(inventory.findOrderableMedicationCandidates(1L, 2L, 3L, "布洛芬缓释"))
                .thenReturn(List.of(medication));
        when(inventory.inspectMedicationAvailability(1L, 2L, 3L, 15L, 30L)).thenReturn(
                new OutpatientPrescriptionInventoryDirectory.MedicationAvailabilityView(true, 1L, "门诊药房",
                        true, 2L, 30L, "BOX", BigDecimal.TEN, BigDecimal.TEN, BigDecimal.ONE));

        var intent = new MedicationIntentParser().parse("布洛芬缓释胶囊", "每次0.3g 口服 bid 共1盒");
        var service = new MedicationCandidateMatchingService(inventory);
        var result = service.match(1L, 2L, 3L, intent);

        assertEquals(MedicationCandidateMatchingService.Status.UNIQUE_MATCH, result.status());
        assertEquals("布洛芬缓释（片剂、胶囊）", result.medication().name());
    }

    @Test
    void multiple_comma_separated_aliases_match_intent() {
        var inventory = mock(OutpatientPrescriptionInventoryDirectory.class);
        var itemPackage = mock(PackageView.class);
        when(itemPackage.id()).thenReturn(30L);
        when(itemPackage.unitCode()).thenReturn("BOX");
        when(itemPackage.unitName()).thenReturn("盒");
        when(itemPackage.sdStatus()).thenReturn("ACTIVE");
        var product = product(15L, "布洛芬缓释胶囊 0.3g*20粒/盒");
        when(product.packages()).thenReturn(List.of(itemPackage));
        var medication = medication("芬必得", List.of(product));
        when(medication.aliasName()).thenReturn("布洛芬缓释胶囊,布洛芬缓释片");

        when(inventory.findOrderableMedicationCandidates(1L, 2L, 3L, "布洛芬缓释胶囊"))
                .thenReturn(List.of(medication));
        when(inventory.inspectMedicationAvailability(1L, 2L, 3L, 15L, 30L)).thenReturn(
                new OutpatientPrescriptionInventoryDirectory.MedicationAvailabilityView(true, 1L, "门诊药房",
                        true, 2L, 30L, "BOX", BigDecimal.TEN, BigDecimal.TEN, BigDecimal.ONE));

        var intent = new MedicationIntentParser().parse("布洛芬缓释胶囊", "每次0.3g 口服 bid 共1盒");
        var service = new MedicationCandidateMatchingService(inventory);
        var result = service.match(1L, 2L, 3L, intent);

        assertEquals(MedicationCandidateMatchingService.Status.UNIQUE_MATCH, result.status());
    }

    private OutpatientPrescriptionInventoryDirectory.OrderableMedicationView medication(
            String name, List<MedicationProductView> products) {
        var value = mock(OutpatientPrescriptionInventoryDirectory.OrderableMedicationView.class);
        when(value.id()).thenReturn(5L);
        when(value.name()).thenReturn(name);
        when(value.code()).thenReturn("MED-1");
        when(value.sdStatus()).thenReturn("ACTIVE");
        when(value.products()).thenReturn(products);
        return value;
    }

    private MedicationProductView product(Long id, String name) {
        var value = mock(MedicationProductView.class);
        when(value.id()).thenReturn(id);
        when(value.name()).thenReturn(name);
        when(value.orderable()).thenReturn(true);
        when(value.stocked()).thenReturn(true);
        when(value.sdStatus()).thenReturn("ACTIVE");
        return value;
    }
}
