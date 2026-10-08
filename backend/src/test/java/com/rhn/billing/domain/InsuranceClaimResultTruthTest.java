package com.rhn.billing.domain;

import com.rhn.billing.api.InsuranceSettlementAdapter.InsuranceResult;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.stream.Stream;
import static org.junit.jupiter.api.Assertions.*;

class InsuranceClaimResultTruthTest {
    static BigDecimal n(String value) { return new BigDecimal(value); }
    static InsuranceClaim claim() {
        return new InsuranceClaim(1L,2L,3L,4L,"KEY","330100","310","payer","H","D","P","HASH",
                Instant.parse("2026-10-04T01:00:00Z"),null,n("100"),"CNY","CORR",5L);
    }
    static InsuranceResult result(String externalNo, String currency, BigDecimal fund, BigDecimal personal,
                                  BigDecimal patient, BigDecimal other) {
        return new InsuranceResult(InsuranceResult.Outcome.SUCCEEDED, externalNo, externalNo, fund,personal,patient,other,currency,null,null,null);
    }
    static InsuranceResult success(String number) { return result(number,"CNY",n("60"),n("20"),n("10"),n("10")); }
    static Stream<Arguments> invalid() {
        return Stream.of(
                Arguments.of("missing fund",result("PRE","CNY",null,n("80"),n("10"),n("10"))),
                Arguments.of("missing personal",result("PRE","CNY",n("80"),null,n("10"),n("10"))),
                Arguments.of("missing patient",result("PRE","CNY",n("80"),n("10"),null,n("10"))),
                Arguments.of("missing other",result("PRE","CNY",n("80"),n("10"),n("10"),null)),
                Arguments.of("negative balanced",result("PRE","CNY",n("101"),n("-1"),n("0"),n("0"))),
                Arguments.of("wrong currency",result("PRE","USD",n("60"),n("20"),n("10"),n("10"))),
                Arguments.of("no currency",result("PRE",null,n("60"),n("20"),n("10"),n("10"))),
                Arguments.of("missing number",success(null)), Arguments.of("blank number",success(" ")),
                Arguments.of("unbalanced",result("PRE","CNY",n("60"),n("20"),n("10"),n("9"))),
                Arguments.of("precision",result("PRE","CNY",n("60.0000001"),n("20"),n("10"),n("9.9999999"))),
                Arguments.of("null response",null));
    }
    @ParameterizedTest(name="{0}") @MethodSource("invalid")
    void rejectsInvalidSuccessWithoutChangingStoredAllocation(String label, InsuranceResult invalid) {
        var claim=claim();
        assertThrows(IllegalStateException.class,()->claim.apply("PRE_SETTLE",invalid));
        assertEquals("PRE_SETTLEMENT_PENDING",claim.status());
        assertNull(claim.externalPreSettlementNo());
        assertEquals(0,claim.insuranceFundAmount().signum());
        assertEquals(0,n("100").compareTo(claim.patientCashAmount()));
    }
    @Test void explicitZeroAndMixedAllocationCanBeConfirmed() {
        var claim=claim(); claim.apply("PRE_SETTLE",result("PRE","CNY",n("60"),n("20"),n("20"),BigDecimal.ZERO));
        assertEquals("PRE_SETTLED",claim.status());
        assertEquals(0,n("20").compareTo(claim.personalAccountAmount()));
    }
    @Test void conflictingExternalNumberCannotOverwriteTheExistingAllocation() {
        var claim=claim(); claim.apply("PRE_SETTLE",success("PRE"));
        assertThrows(IllegalStateException.class,()->claim.apply("PRE_SETTLE",result("OTHER","CNY",n("70"),n("10"),n("10"),n("10"))));
        assertEquals("PRE",claim.externalPreSettlementNo()); assertEquals(0,n("60").compareTo(claim.insuranceFundAmount()));
    }
    @Test void reversalMustRestoreEveryOriginalFundingSource() {
        var claim=claim(); claim.apply("PRE_SETTLE",success("PRE")); claim.prepareSettlement(); claim.apply("SETTLE",success("SET"));
        claim.prepareReversal("取消");
        assertThrows(IllegalStateException.class,()->claim.apply("REVERSE",result("REV","CNY",n("100"),n("0"),n("0"),n("0"))));
        assertEquals("REVERSAL_PENDING",claim.status());
        claim.apply("REVERSE",success("REV")); assertEquals("REVERSED",claim.status());
        assertEquals(0,n("20").compareTo(claim.personalAccountAmount()));
    }
    @Test void unknownOrPendingResultDoesNotPublishNewAmounts() {
        var claim=claim(); claim.apply("PRE_SETTLE",new InsuranceResult(InsuranceResult.Outcome.PENDING,null,null,
                null,null,null,null,null,"WAIT","待确认",null));
        assertEquals("PRE_SETTLEMENT_PENDING",claim.status()); assertEquals(0,claim.insuranceFundAmount().signum());
        assertEquals(0,n("100").compareTo(claim.patientCashAmount()));
    }
    @Test void successWithFailureCodeIsContradictoryAndCannotBePosted() {
        var claim=claim();
        var result=new InsuranceResult(InsuranceResult.Outcome.SUCCEEDED,"PRE","PRE",n("60"),n("20"),n("10"),n("10"),"CNY","REJECTED","失败",null);
        assertThrows(IllegalStateException.class,()->claim.apply("PRE_SETTLE",result));
        assertEquals("PRE_SETTLEMENT_PENDING",claim.status());
    }

    @ParameterizedTest @ValueSource(strings={"PRE_SETTLE","SETTLE","REVERSE"})
    void confirmedResultsCannotBeDowngradedOrReallocated(String operation) {
        var claim=claim(); claim.apply("PRE_SETTLE",success("PRE"));
        if (!operation.equals("PRE_SETTLE")) { claim.prepareSettlement(); claim.apply("SETTLE",success("SET")); }
        if (operation.equals("REVERSE")) { claim.prepareReversal("取消"); claim.apply("REVERSE",success("REV")); }
        String before=claim.status(); var reversedAt=claim.reversedAt();
        String number=operation.equals("PRE_SETTLE")?"PRE":operation.equals("SETTLE")?"SET":"REV";
        claim.apply(operation,success(number));
        assertEquals(reversedAt,claim.reversedAt());
        assertThrows(IllegalStateException.class,()->claim.apply(operation,result(number,"CNY",n("70"),n("10"),n("10"),n("10"))));
        for(var outcome:new InsuranceResult.Outcome[]{InsuranceResult.Outcome.PENDING,InsuranceResult.Outcome.FAILED}) {
            assertThrows(IllegalStateException.class,()->claim.apply(operation,new InsuranceResult(outcome,null,null,
                    null,null,null,null,null,"LATE","迟到回执",null)));
        }
        assertEquals(before,claim.status()); assertEquals(reversedAt,claim.reversedAt());
        assertEquals(0,n("60").compareTo(claim.insuranceFundAmount()));
    }

    @Test void queryMustCarryTheStageItActuallyObserved() {
        var claim=claim(); claim.apply("PRE_SETTLE",success("PRE")); claim.prepareSettlement();
        assertThrows(IllegalStateException.class,()->claim.apply("QUERY",success("PRE")));
        assertThrows(IllegalStateException.class,()->claim.apply("PRE_SETTLE",success("PRE")));
        assertEquals("SETTLEMENT_PENDING",claim.status()); assertNull(claim.externalSettlementNo());
    }

    @Test void pendingReversalNumberCannotReplaceOriginalSettlementNumber() {
        var claim=claim(); claim.apply("PRE_SETTLE",success("PRE")); claim.prepareSettlement(); claim.apply("SETTLE",success("SET"));
        claim.prepareReversal("取消");
        claim.apply("REVERSE",new InsuranceResult(InsuranceResult.Outcome.PENDING,"REV-ACK",null,null,null,null,null,"CNY",null,null,null));
        assertEquals("SET",claim.externalSettlementNo()); assertEquals("REVERSAL_PENDING",claim.status());
    }

}
