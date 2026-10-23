package com.rhn.billing.domain;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class SettlementModeTest {
    private static BigDecimal money(String value) { return new BigDecimal(value).setScale(6); }

    private static Settlement settlement(String type, String amount) {
        return new Settlement(2L, 1L, 3L, 4L, "STL", "CMD", type, "OUTPATIENT", "CASHIER",
                money(amount), "CNY", "TEST", 5L, Instant.now());
    }

    @Test
    void newSettlementDefaultsToSelfPay() {
        assertEquals(Settlement.SELF_PAY, settlement("NORMAL", "10").settlementMode());
    }

    @Test
    void insuranceSettlementWithZeroFundIsStillMedicalInsurance() {
        Settlement value = settlement("NORMAL", "10");
        value.applyInsuranceAllocation(money("0"), money("0"), money("10"), money("0"));
        assertEquals(0, value.insuranceAmount().signum());
        assertEquals(Settlement.MEDICAL_INSURANCE, value.settlementMode());
    }

    @Test
    void insuranceReversalKeepsMedicalInsuranceBecauseTheClaimCannotBeRestarted() {
        Settlement value = settlement("NORMAL", "10");
        value.applyInsuranceAllocation(money("6"), money("1"), money("3"), money("0"));
        value.applyPaidAmount(money("10"), 5L, Instant.now());
        value.reverseInsuranceAllocation();
        assertEquals(Settlement.MEDICAL_INSURANCE, value.settlementMode());
    }

    @Test
    void reversalInheritsTheOriginalSettlementMode() {
        Settlement reversal = settlement("REVERSAL", "-10");
        reversal.inheritSettlementMode(Settlement.MEDICAL_INSURANCE);
        assertEquals(Settlement.MEDICAL_INSURANCE, reversal.settlementMode());
        Settlement selfPay = settlement("REVERSAL", "-10");
        selfPay.inheritSettlementMode(Settlement.SELF_PAY);
        assertEquals(Settlement.SELF_PAY, selfPay.settlementMode());
    }

    @Test
    void onlyReversalSettlementsInheritAndOnlyKnownModes() {
        assertThrows(IllegalStateException.class,
                () -> settlement("NORMAL", "10").inheritSettlementMode(Settlement.MEDICAL_INSURANCE));
        assertThrows(IllegalArgumentException.class,
                () -> settlement("REVERSAL", "-10").inheritSettlementMode("OTHER"));
    }
}
