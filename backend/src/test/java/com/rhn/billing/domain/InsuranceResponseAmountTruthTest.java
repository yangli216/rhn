package com.rhn.billing.domain;

import com.rhn.billing.api.InsuranceSettlementAdapter.InsuranceResult;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.test.util.ReflectionTestUtils;
import java.math.BigDecimal;
import static org.junit.jupiter.api.Assertions.*;

class InsuranceResponseAmountTruthTest {
    InsuranceResult result(InsuranceResult.Outcome outcome,BigDecimal fund,BigDecimal personal,BigDecimal cash,BigDecimal other) {
        return new InsuranceResult(outcome,"EXT","MSG",fund,personal,cash,other,"CNY",null,null,null);
    }
    InsuranceClaimResponse response(InsuranceResult result) { return new InsuranceClaimResponse(1L,2L,null,"CMD","SETTLE",result); }
    @ParameterizedTest @ValueSource(strings={"PENDING","FAILED"})
    void missingAmountsRemainUnknownAndCannotReplayAsExplicitZero(String status) {
        var outcome=InsuranceResult.Outcome.valueOf(status);
        var unknown=result(outcome,null,null,null,null); var zero=result(outcome,BigDecimal.ZERO,BigDecimal.ZERO,BigDecimal.ZERO,BigDecimal.ZERO);
        var value=response(unknown);
        assertEquals("REPORTED",value.amountSource()); assertNull(value.insuranceFundAmount()); assertNull(value.personalAccountAmount());
        assertNull(value.patientCashAmount()); assertNull(value.otherFundAmount());
        assertTrue(value.matches("SETTLE",unknown,"CNY")); assertFalse(value.matches("SETTLE",zero,"CNY"));
        var explicit=response(zero); assertEquals(0,explicit.insuranceFundAmount().signum());
        assertFalse(explicit.matches("SETTLE",unknown,"CNY")); assertTrue(explicit.matches("SETTLE",zero,"CNY"));
    }
    @Test void eachAmountPreservesItsOwnPresence() {
        var value=response(result(InsuranceResult.Outcome.PENDING,BigDecimal.ZERO,null,new BigDecimal("25.50"),null));
        assertEquals(0,value.insuranceFundAmount().signum()); assertNull(value.personalAccountAmount());
        assertEquals(0,new BigDecimal("25.5").compareTo(value.patientCashAmount())); assertNull(value.otherFundAmount());
    }
    @Test void legacyValuesRemainStoredButAreNotExposedAsReportedFactsOrUsedForReplay() {
        var original=result(InsuranceResult.Outcome.SUCCEEDED,new BigDecimal("60"),new BigDecimal("20"),new BigDecimal("20"),BigDecimal.ZERO);
        var value=response(original); ReflectionTestUtils.setField(value,"amountSource","LEGACY_UNVERIFIED");
        assertEquals("LEGACY_UNVERIFIED",value.amountSource()); assertFalse(value.hasReportedAmounts());
        assertNull(value.insuranceFundAmount()); assertNull(value.personalAccountAmount()); assertNull(value.patientCashAmount()); assertNull(value.otherFundAmount());
        assertEquals(0,new BigDecimal("60").compareTo((BigDecimal)ReflectionTestUtils.getField(value,"insuranceFundAmount")));
        assertFalse(value.matches("SETTLE",original,"CNY"));
    }
    @Test void successfulResponsesRequireExplicitAmountsWhileZeroIsValid() {
        var zero=BigDecimal.ZERO;
        for(int missing=0;missing<4;missing++) {
            BigDecimal[] values={zero,zero,zero,zero}; values[missing]=null;
            assertThrows(IllegalStateException.class,()->response(result(InsuranceResult.Outcome.SUCCEEDED,values[0],values[1],values[2],values[3])));
        }
        assertEquals(0,response(result(InsuranceResult.Outcome.SUCCEEDED,zero,zero,zero,zero)).otherFundAmount().signum());
    }
    @Test void optionalReportedAmountsCannotBeNegativeOrRoundedIntoAnotherValue() {
        assertThrows(IllegalStateException.class,()->response(result(InsuranceResult.Outcome.PENDING,new BigDecimal("-1"),null,null,null)));
        assertThrows(ArithmeticException.class,()->response(result(InsuranceResult.Outcome.PENDING,new BigDecimal("0.0000001"),null,null,null)));
    }
}
