package com.rhn.billing.domain;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** 结算舍入回退与结清上限的领域规则：net = gross + rounding - discount，回退幂等，已结清不可回退，不接受超额资金。 */
class SettlementRoundingRevertTest {
    private static BigDecimal money(String value) { return new BigDecimal(value).setScale(6); }

    private static Settlement settlement(String type, String amount) {
        return new Settlement(2L, 1L, 3L, 4L, "STL", "CMD", type, "OUTPATIENT", "CASHIER",
                money(amount), "CNY", "TEST", 5L, Instant.now());
    }

    @Test
    void revertRestoresNetAndPatientAmountAndIsIdempotent() {
        Settlement value = settlement("NORMAL", "33.67");
        value.applyRoundingAdjustment(money("-0.07"));
        assertEquals(0, money("33.60").compareTo(value.netAmount()));
        assertTrue(value.revertRounding());
        assertEquals(0, money("33.67").compareTo(value.netAmount()));
        assertEquals(0, money("33.67").compareTo(value.patientAmount()));
        assertEquals(0, value.roundingAmount().signum());
        assertFalse(value.revertRounding());
        assertEquals(0, money("33.67").compareTo(value.netAmount()));
    }

    @Test
    void revertKeepsDiscountAndInsuranceShares() {
        Settlement value = settlement("NORMAL", "100");
        value.applyPreInsuranceDiscount(money("10"));
        value.applyInsuranceAllocation(money("54"), money("0"), money("36"), money("0"));
        value.applyRoundingAdjustment(money("-0.05"));
        assertEquals(0, money("89.95").compareTo(value.netAmount()));
        assertEquals(0, money("35.95").compareTo(value.patientAmount()));
        assertTrue(value.revertRounding());
        assertEquals(0, money("90").compareTo(value.netAmount()));
        assertEquals(0, money("36").compareTo(value.patientAmount()));
        assertEquals(0, money("10").compareTo(value.discountAmount()));
    }

    @Test
    void settledSettlementCannotRevertRounding() {
        Settlement value = settlement("NORMAL", "33.67");
        value.applyRoundingAdjustment(money("-0.07"));
        value.applyPaidAmount(money("33.60"), 5L, Instant.now());
        assertEquals(SettlementStatus.SETTLED, value.status());
        assertThrows(IllegalStateException.class, value::revertRounding);
        assertEquals(0, money("33.60").compareTo(value.netAmount()));
    }

    @Test
    void normalSettlementRejectsFundsAboveNetButReversalIsUnaffected() {
        Settlement value = settlement("NORMAL", "10");
        assertThrows(IllegalStateException.class, () -> value.applyPaidAmount(money("10.000001"), 5L, Instant.now()));
        assertEquals(SettlementStatus.PRICED, value.status());
        value.applyPaidAmount(money("10"), 5L, Instant.now());
        assertEquals(SettlementStatus.SETTLED, value.status());
        Settlement reversal = settlement("REVERSAL", "-10");
        assertEquals("PRICED", reversal.applyPaidAmount(money("5"), 5L, Instant.now()));
        assertEquals(SettlementStatus.PRICED, reversal.status());
    }
}
