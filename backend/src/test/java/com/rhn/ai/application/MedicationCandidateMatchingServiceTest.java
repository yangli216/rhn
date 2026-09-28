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
    @Test
    void multiple_products_are_never_silently_selected() {
        var inventory = mock(OutpatientPrescriptionInventoryDirectory.class);
        var medication = medication("硝苯地平控释片", List.of(product(10L, "硝苯地平控释片 30mg"),
                product(11L, "硝苯地平控释片 60mg")));
        when(inventory.findOrderableMedications(1L, 2L, 3L, "硝苯地平控释片"))
                .thenReturn(List.of(medication));

        var intent = new MedicationIntentParser().parse("硝苯地平控释片", "30mg 口服 qd 共1盒");
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
        when(inventory.findOrderableMedications(1L, 2L, 3L, "氨氯地平片"))
                .thenReturn(List.of(medication));
        when(inventory.inspectMedicationAvailability(1L, 2L, 3L, 10L, 20L)).thenReturn(
                new OutpatientPrescriptionInventoryDirectory.MedicationAvailabilityView(true, 1L, "门诊药房",
                        true, 2L, 20L, "BOX", BigDecimal.TEN, BigDecimal.TEN, BigDecimal.ONE));

        var complete = new MedicationIntentParser().parse("氨氯地平片", "5mg 口服 qd 共1盒");
        var missing = new MedicationIntentParser().parse("氨氯地平片", "共1盒");
        MedicationCandidateMatchingService service = new MedicationCandidateMatchingService(inventory);

        assertEquals(MedicationCandidateMatchingService.Status.UNIQUE_MATCH,
                service.match(1L, 2L, 3L, complete).status());
        assertEquals(MedicationCandidateMatchingService.Status.NEEDS_REVIEW,
                service.match(1L, 2L, 3L, missing).status());
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
