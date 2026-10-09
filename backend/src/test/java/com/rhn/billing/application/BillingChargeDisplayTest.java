package com.rhn.billing.application;

import com.rhn.billing.api.BillingViews.ChargeItemView;
import com.rhn.billing.domain.ChargeItem;
import com.rhn.outpatient.api.MedicationRequestDirectory;
import com.rhn.outpatient.api.MedicationRequestDirectory.MedicationRequestSnapshot;
import com.rhn.shared.api.BusinessException;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class BillingChargeDisplayTest {
    private final MedicationRequestDirectory requests = mock(MedicationRequestDirectory.class);
    private final BillingApplicationService service = mock(BillingApplicationService.class, CALLS_REAL_METHODS);

    BillingChargeDisplayTest() {
        ReflectionTestUtils.setField(service, "medicationRequestDirectory", requests);
    }

    @Test
    void matching_request_unit_uses_historical_package_name_even_when_master_name_changes() {
        var charge = medicationCharge("BOX");
        var snapshot = mock(MedicationRequestSnapshot.class);
        when(snapshot.quantityUnit()).thenReturn("BOX");
        when(snapshot.packageUnitName()).thenReturn("历史包装盒");
        when(requests.requireForRouting(1L, 7L)).thenReturn(snapshot);
        assertEquals("历史包装盒", view(charge, Map.of("BOX", "新单位名称")).unitName());
    }

    @Test
    void base_unit_charges_do_not_take_the_request_package_name() {
        var charge = medicationCharge("EA");
        var snapshot = mock(MedicationRequestSnapshot.class);
        when(snapshot.quantityUnit()).thenReturn("BOX");
        when(snapshot.packageUnitName()).thenReturn("盒");
        when(requests.requireForRouting(1L, 7L)).thenReturn(snapshot);
        assertEquals("片", view(charge, Map.of("EA", "片")).unitName());
    }

    @Test
    void service_units_and_unknown_codes_are_resolved_without_medication_lookup() {
        var charge = mock(ChargeItem.class);
        when(charge.sourceType()).thenReturn("SERVICE_REQUEST");
        when(charge.unitCode()).thenReturn("custom");
        assertEquals("本院计价单位", view(charge, Map.of("CUSTOM", "本院计价单位")).unitName());
        assertNull(view(charge, Map.of()).unitName());
        verifyNoInteractions(requests);
    }

    @Test
    void missing_history_uses_master_names_but_other_lookup_failures_propagate() {
        var charge = medicationCharge("BOX");
        when(requests.requireForRouting(1L, 7L)).thenThrow(new BusinessException("MEDICATION_REQUEST_NOT_FOUND", "历史医嘱缺失", HttpStatus.NOT_FOUND));
        assertEquals("Carton", view(charge, Map.of("BOX", "Carton")).unitName());
        var failure = new IllegalStateException("database unavailable");
        doThrow(failure).when(requests).requireForRouting(1L, 7L);
        assertSame(failure, assertThrows(IllegalStateException.class, () -> view(charge, Map.of())));
    }

    @Test
    void dispense_source_id_is_not_treated_as_a_medication_request_id() {
        var charge = mock(ChargeItem.class);
        when(charge.sourceType()).thenReturn("MEDICATION_DISPENSE");
        when(charge.sourceId()).thenReturn(99L);
        when(charge.requestId()).thenReturn(null);
        when(charge.unitCode()).thenReturn("EA");
        assertEquals("片", view(charge, Map.of("EA", "片")).unitName());
        verifyNoInteractions(requests);
    }

    private ChargeItem medicationCharge(String unit) {
        var charge = mock(ChargeItem.class);
        when(charge.tenantId()).thenReturn(1L);
        when(charge.requestId()).thenReturn(7L);
        when(charge.sourceType()).thenReturn("MEDICATION_DISPENSE");
        when(charge.unitCode()).thenReturn(unit);
        return charge;
    }

    private ChargeItemView view(ChargeItem charge, Map<String, String> names) {
        return ReflectionTestUtils.invokeMethod(service, "chargeView", charge, names, null);
    }
}
