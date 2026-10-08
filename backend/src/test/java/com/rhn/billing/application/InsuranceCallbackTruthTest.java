package com.rhn.billing.application;

import com.rhn.billing.api.InsuranceResultDirectory.*;
import com.rhn.billing.api.InsuranceSettlementAdapter.InsuranceResult;
import com.rhn.billing.domain.InsuranceClaim;
import com.rhn.billing.infrastructure.insurance.chs.NationalInsuranceClient;
import com.rhn.platform.integration.api.ExternalMessageService;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class InsuranceCallbackTruthTest {
    final InsuranceClaimTransactionService transactions=mock(InsuranceClaimTransactionService.class);
    final ExternalMessageService messages=mock(ExternalMessageService.class);
    final ExecutionContextProvider contexts=mock(ExecutionContextProvider.class);
    final InsuranceClaim claim=new InsuranceClaim(1L,2L,3L,4L,"KEY","REGION","BASIC","payer","H","D","P","HASH",
            Instant.parse("2026-10-04T01:00:00Z"),null,new BigDecimal("100"),"CNY","corr",5L);
    InsuranceClaimApplicationService service;
    @BeforeEach void setup() {
        service=new InsuranceClaimApplicationService(transactions,List.of(),messages,contexts,mock(NationalInsuranceClient.class));
        when(contexts.requireCurrent()).thenReturn(new ExecutionContext(1L,5L,"cashier","corr",Set.of(),6L,7L,"SELF",Set.of(),Set.of()));
        when(transactions.requireBySettlementNo("STL")).thenReturn(claim);
    }
    VerifiedInsuranceResult input(String currency,VerifiedInsuranceResult.ResultStatus status) {
        return new VerifiedInsuranceResult("REGION","MSG","COMMAND","STL",VerifiedInsuranceResult.Operation.SETTLE,"SET",status,
                new BigDecimal("60"),new BigDecimal("20"),new BigDecimal("10"),new BigDecimal("10"),currency,null,null,null);
    }
    @Test void successCannotBorrowCurrencyFromTheClaim() {
        for(String currency:new String[]{null,""," "}) {
            assertEquals("INSURANCE_CALLBACK_CURRENCY_REQUIRED",assertThrows(BusinessException.class,
                    ()->service.accept(input(currency,VerifiedInsuranceResult.ResultStatus.SUCCEEDED))).code());
        }
        assertEquals("INSURANCE_CALLBACK_CURRENCY_MISMATCH",assertThrows(BusinessException.class,
                ()->service.accept(input("USD",VerifiedInsuranceResult.ResultStatus.SUCCEEDED))).code());
        verify(transactions,never()).applyInbound(anyLong(),anyString(),any(),anyString(),any()); verifyNoInteractions(messages);
    }
    @Test void durablePayloadIncludesActualAccountingFactsEvenWhenSanitizedPayloadIsAbsent() {
        service.accept(input(" cny ",VerifiedInsuranceResult.ResultStatus.SUCCEEDED));
        var result=ArgumentCaptor.forClass(InsuranceResult.class);
        var envelope=ArgumentCaptor.forClass(ExternalMessageService.InboundMessage.class);
        verify(transactions).applyInbound(eq(claim.id()),eq("SETTLE"),result.capture(),eq("COMMAND"),envelope.capture());
        assertEquals("CNY",result.getValue().currencyCode());
        var payload=(Map<?,?>)envelope.getValue().payload();
        assertEquals(claim.id(),payload.get("claimId")); assertEquals("STL",payload.get("settlementNo"));
        assertEquals("CNY",payload.get("currencyCode")); assertEquals(new BigDecimal("60"),payload.get("insuranceFundAmount"));
        assertEquals("SETTLE",payload.get("operation")); assertEquals("SUCCEEDED",payload.get("status"));
        assertEquals("SET",payload.get("externalSettlementNo")); assertTrue(payload.containsKey("sanitizedPayload"));
        verifyNoInteractions(messages);
    }
    @Test void pendingUnknownCurrencyRemainsUnknown() {
        service.accept(input(null,VerifiedInsuranceResult.ResultStatus.PENDING));
        var result=ArgumentCaptor.forClass(InsuranceResult.class);
        verify(transactions).applyInbound(eq(claim.id()),eq("SETTLE"),result.capture(),eq("COMMAND"),any());
        assertNull(result.getValue().currencyCode());
    }
    @Test void missingIdentityOrResultDoesNotReachTheDurableBoundary() {
        assertThrows(BusinessException.class,()->service.accept(null));
        var source=input("CNY",VerifiedInsuranceResult.ResultStatus.SUCCEEDED);
        var missing=new VerifiedInsuranceResult(source.regionCode(),null,source.commandCode(),source.settlementNo(),source.operation(),source.externalSettlementNo(),
                source.status(),source.insuranceFundAmount(),source.personalAccountAmount(),source.patientCashAmount(),source.otherFundAmount(),source.currencyCode(),null,null,null);
        assertThrows(BusinessException.class,()->service.accept(missing));
        verify(transactions,never()).applyInbound(anyLong(),anyString(),any(),anyString(),any());
    }
}
