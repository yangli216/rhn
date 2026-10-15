package com.rhn.billing.application;

import com.rhn.platform.dictionary.api.DictionaryDirectory;
import com.rhn.platform.dictionary.api.DictionaryValue;
import com.rhn.platform.dictionary.api.SystemEnumDirectory;
import com.rhn.shared.api.BusinessException;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class BillingCodesTest {
    final DictionaryDirectory dictionaries = mock(DictionaryDirectory.class);
    final SystemEnumDirectory systemEnums = mock(SystemEnumDirectory.class);
    final BillingCodes codes = new BillingCodes(dictionaries, systemEnums);

    BillingCodesTest() {
        when(dictionaries.resolveActiveItems(1L, "PAY_USE_SCENE")).thenReturn(List.of(
                new DictionaryValue("CASHIER", "收费处", 10, Map.of()),
                new DictionaryValue("DOCTOR_STATION", "医生站", 20, Map.of())));
        when(dictionaries.resolveActiveItems(1L, "PAY_METHOD")).thenReturn(List.of(
                new DictionaryValue("CASH", "现金", 10, Map.of("TENDER_TYPE", "CASH")),
                new DictionaryValue("VOUCHER", "代金券", 20, Map.of()),
                new DictionaryValue("POINTS", "积分", 30, Map.of("TENDER_TYPE", "POINTS"))));
        when(systemEnums.contains(eq("BIL_TENDER_TYPE"), anyString()))
                .thenAnswer(call -> !"POINTS".equals(call.getArgument(1)));
    }

    @Test void blankSceneMeansTheCashierWindowAndOtherScenesComeFromTheDictionary() {
        assertEquals("CASHIER", codes.paymentScene(1L, " "));
        assertEquals("DOCTOR_STATION", codes.paymentScene(1L, "doctor_station"));
        assertEquals("PAYMENT_SCENE_INVALID",
                assertThrows(BusinessException.class, () -> codes.paymentScene(1L, "CLINIC_SETTLE")).code());
    }

    @Test void paymentsNeedATenderTypeThatIsARegisteredValue() {
        assertEquals("CASH", codes.requireTenderType(1L, "CASH"));
        assertEquals("PAYMENT_METHOD_TENDER_TYPE_MISSING",
                assertThrows(BusinessException.class, () -> codes.requireTenderType(1L, "VOUCHER")).code());
        assertTrue(codes.tenderType(1L, "POINTS").isEmpty());
        assertTrue(codes.tenderType(1L, "UNKNOWN").isEmpty());
    }
}
