package com.rhn.billing.infrastructure.insurance.chs;

import com.rhn.billing.api.InsuranceSettlementAdapter.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ChsInsuranceResultTruthTest {
    static BigDecimal n(String value) { return new BigDecimal(value); }
    static final Instant TIME = Instant.parse("2026-10-04T01:00:00Z");
    final NationalInsuranceClient client = mock(NationalInsuranceClient.class);
    final ChsInsuranceSettlementAdapter adapter = new ChsInsuranceSettlementAdapter(client);
    final InsuranceInstruction instruction = new InsuranceInstruction(1L,2L,"SET","KEY",3L,4L,5L,6L,"330100","310",
            "H","D","P",TIME,null,"HASH",List.of(new InsuranceLine(7L,8L,"LOCAL-SERVICE","INS-SERVICE","诊疗",
            BigDecimal.ONE,n("100"),n("100"),"LAB",Map.of())),n("100"),"CNY","CORR");
    final ChsModels.PreSettleRequest preRequest = new ChsModels.PreSettleRequest("EXTERNAL-PERSON","310",2L,"SET",n("100"),"H","D","P",
            List.of(new ChsModels.FeedetItem(7L,"LOCAL-SERVICE","INS-SERVICE","医保诊疗","2","3",BigDecimal.ONE,n("100"),n("100"))));
    final InsuranceReversal reversal = new InsuranceReversal(1L,2L,"SET","REV-KEY","330100","310","FINAL",n("100"),"取消","CORR",
            4L,6L,"P","CNY",n("60"),n("20"),n("10"),n("10"));
    @BeforeEach void setup() {
        when(client.isAvailable()).thenReturn(true);
        when(client.preparePreSettle(instruction)).thenReturn(preRequest);
        when(client.prepareSettle(instruction,"PRE")).thenReturn(new ChsModels.SettleRequest("PRE","EXTERNAL-PERSON","SET","EXTERNAL-OPERATOR"));
        when(client.prepareReversal(reversal)).thenReturn(new ChsModels.ReversalRequest("FINAL","EXTERNAL-PERSON","EXTERNAL-OPERATOR","取消"));
        when(client.preSettle(any())).thenReturn(pre("PRE","CNY",n("100"),n("60"),n("5"),n("5"),n("20"),n("10")));
        when(client.settle(any())).thenReturn(new ChsModels.SettleResponse("FINAL","PRE",n("100"),n("60"),n("5"),n("5"),n("20"),n("10"),TIME,"ok"));
        when(client.reverse(any())).thenReturn(new ChsModels.ReversalResponse("REV","FINAL",TIME,true,"ok"));
    }
    static ChsModels.PreSettleResponse pre(String number,String currency,BigDecimal total,BigDecimal fund,BigDecimal supplemental,
                                           BigDecimal other,BigDecimal personal,BigDecimal patient) {
        return new ChsModels.PreSettleResponse(number,total,n("90"),fund,supplemental,other,personal,patient,n("0"),n("0"),currency,"ok");
    }
    @Test void usesExplicitExternalIdentifiersAndFeeMetadataAndIncludesSupplementalFund() {
        var result=adapter.preSettle(instruction);
        assertEquals(InsuranceResult.Outcome.SUCCEEDED,result.outcome());
        assertEquals(0,n("10").compareTo(result.otherFundAmount()));
        verify(client).preSettle(preRequest); // No rewrite of the prepared diagnosis-service category or self-pay grade.
        var settled=adapter.settle(instruction,"PRE");
        assertEquals(0,n("10").compareTo(settled.otherFundAmount()));
        verify(client).settle(new ChsModels.SettleRequest("PRE","EXTERNAL-PERSON","SET","EXTERNAL-OPERATOR"));
    }
    static Stream<Arguments> invalidResponses() {
        return Stream.of(Arguments.of("absent",null),
                Arguments.of("no receipt",pre(null,"CNY",n("100"),n("60"),n("5"),n("5"),n("20"),n("10"))),
                Arguments.of("no currency",pre("PRE",null,n("100"),n("60"),n("5"),n("5"),n("20"),n("10"))),
                Arguments.of("wrong currency",pre("PRE","USD",n("100"),n("60"),n("5"),n("5"),n("20"),n("10"))),
                Arguments.of("wrong total",pre("PRE","CNY",n("99"),n("60"),n("5"),n("5"),n("20"),n("9"))),
                Arguments.of("missing supplemental",pre("PRE","CNY",n("100"),n("60"),null,n("10"),n("20"),n("10"))),
                Arguments.of("missing account",pre("PRE","CNY",n("100"),n("80"),n("5"),n("5"),null,n("10"))),
                Arguments.of("negative but balanced",pre("PRE","CNY",n("100"),n("101"),n("0"),n("0"),n("-1"),n("0"))),
                Arguments.of("unbalanced",pre("PRE","CNY",n("100"),n("60"),n("5"),n("5"),n("20"),n("9"))));
    }
    @ParameterizedTest(name="{0}") @MethodSource("invalidResponses")
    void malformedResponseAfterSubmissionRemainsUnconfirmed(String label,ChsModels.PreSettleResponse response) {
        when(client.preSettle(any())).thenReturn(response);
        assertThrows(IllegalStateException.class,()->adapter.preSettle(instruction));
        verify(client).preSettle(preRequest);
    }
    @Test void availableNetworkClientWithoutMetadataPreparationCannotSubmit() {
        var unprepared=mock(NationalInsuranceClient.class,CALLS_REAL_METHODS);
        var result=new ChsInsuranceSettlementAdapter(unprepared).preSettle(instruction);
        assertEquals(InsuranceResult.Outcome.FAILED,result.outcome());
        assertEquals("CHS_REQUEST_CONTEXT_UNCONFIRMED",result.errorCode());
        verify(unprepared,never()).preSettle(any());
    }
    @Test void incompletePersonOrFeeMetadataCannotBeReplacedWithInternalValues() {
        when(client.preparePreSettle(instruction)).thenReturn(new ChsModels.PreSettleRequest(null,"310",2L,"SET",n("100"),"H","D","P",preRequest.feedetList()));
        assertEquals(InsuranceResult.Outcome.FAILED,adapter.preSettle(instruction).outcome());
        when(client.preparePreSettle(instruction)).thenReturn(new ChsModels.PreSettleRequest("PSN","310",2L,"SET",n("100"),"H","D","P",
                List.of(new ChsModels.FeedetItem(7L,"LOCAL-SERVICE",null,"医保诊疗",null,null,BigDecimal.ONE,n("100"),n("100")))));
        assertEquals(InsuranceResult.Outcome.FAILED,adapter.preSettle(instruction).outcome());
        verify(client,never()).preSettle(any());
    }
    @Test void preparedRequestCannotChangeOriginalAmountOrSettlement() {
        when(client.preparePreSettle(instruction)).thenReturn(new ChsModels.PreSettleRequest("PSN","310",99L,"OTHER",n("100"),"H","D","P",preRequest.feedetList()));
        assertEquals(InsuranceResult.Outcome.FAILED,adapter.preSettle(instruction).outcome());
        verify(client,never()).preSettle(any());
    }
    @Test void missingPreSettlementNumberCannotBeSynthesized() {
        assertEquals(InsuranceResult.Outcome.FAILED,adapter.settle(instruction,null).outcome());
        verify(client,never()).prepareSettle(any(),any()); verify(client,never()).settle(any());
    }
    @Test void finalResponseMustReferenceTheSubmittedPreSettlement() {
        when(client.settle(any())).thenReturn(new ChsModels.SettleResponse("FINAL","OTHER",n("100"),n("60"),n("5"),n("5"),n("20"),n("10"),TIME,"ok"));
        assertThrows(IllegalStateException.class,()->adapter.settle(instruction,"PRE"));
    }
    @Test void fullReversalPreservesOriginalFundPersonalCashAndOtherAmounts() {
        var result=adapter.reverse(reversal);
        assertEquals(InsuranceResult.Outcome.SUCCEEDED,result.outcome());
        assertEquals(0,n("60").compareTo(result.insuranceFundAmount())); assertEquals(0,n("20").compareTo(result.personalAccountAmount()));
        assertEquals(0,n("10").compareTo(result.patientCashAmount())); assertEquals(0,n("10").compareTo(result.otherFundAmount()));
        verify(client).reverse(new ChsModels.ReversalRequest("FINAL","EXTERNAL-PERSON","EXTERNAL-OPERATOR","取消"));
    }
    @Test void reversalAcknowledgementMustMatchOriginalSettlement() {
        when(client.reverse(any())).thenReturn(new ChsModels.ReversalResponse("REV","OTHER",TIME,true,"ok"));
        assertThrows(IllegalStateException.class,()->adapter.reverse(reversal));
        when(client.reverse(any())).thenReturn(new ChsModels.ReversalResponse(null,"FINAL",TIME,true,"ok"));
        assertThrows(IllegalStateException.class,()->adapter.reverse(reversal));
        when(client.reverse(any())).thenReturn(new ChsModels.ReversalResponse(null,"FINAL",TIME,false,"rejected"));
        assertEquals(InsuranceResult.Outcome.FAILED,adapter.reverse(reversal).outcome());
    }
}
