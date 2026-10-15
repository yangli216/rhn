package com.rhn.ai.application;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class PlanInvestigationAmountsTest {
    @Test void amountsInAdviceFieldsAreNotQuantities() {
        String text = "数量：2 次；适用条件：每3次发热后";
        assertTrue(PlanInvestigationAmounts.hasAmount(PlanInvestigationAmounts.withoutAdvice(text)));
        assertEquals(new java.math.BigDecimal("2"), PlanInvestigationAmounts.quantity(PlanInvestigationAmounts.withoutAdvice(text), "次"));
        assertFalse(PlanInvestigationAmounts.hasAmount(PlanInvestigationAmounts.withoutAdvice("血常规；适用条件：发热3次以上")));
    }
}
