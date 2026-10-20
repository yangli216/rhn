package com.rhn.billing.application;

import com.rhn.billing.infrastructure.insurance.chs.NationalInsuranceClient;
import com.rhn.platform.integration.api.ExternalMessageService;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.junit.jupiter.api.Test;
import java.util.List;
import java.util.Set;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class InsuranceQuickCommandTest {
    @Test void requiresCallerCommandInsteadOfGeneratingADifferentOneForEveryRetry() {
        var transactions=mock(InsuranceClaimTransactionService.class);
        var context=mock(ExecutionContextProvider.class);
        when(context.requireCurrent()).thenReturn(new ExecutionContext(1L,2L,"cashier","corr",Set.of()));
        var service=new InsuranceClaimApplicationService(transactions,List.of(),mock(ExternalMessageService.class),context,mock(NationalInsuranceClient.class));
        for(String command:new String[]{null," ","x".repeat(129)}) {
            assertEquals("INSURANCE_COMMAND_REQUIRED",assertThrows(BusinessException.class,
                    ()->service.quickPreSettle(3L,null,null,null,command)).code());
        }
        verifyNoInteractions(transactions);
    }

    @Test void reusesTheExistingClaimInsteadOfFailingWhenSettlementAlreadyHasOne() {
        var transactions=mock(InsuranceClaimTransactionService.class);
        var context=mock(ExecutionContextProvider.class);
        when(context.requireCurrent()).thenReturn(new ExecutionContext(1L,2L,"cashier","corr",Set.of()));
        var existing=mock(com.rhn.billing.api.InsuranceResultDirectory.InsuranceSettlementView.class);
        when(transactions.existingClaimId(3L)).thenReturn(java.util.Optional.of(9L));
        when(transactions.view(9L,true)).thenReturn(existing);
        var service=new InsuranceClaimApplicationService(transactions,List.of(),mock(ExternalMessageService.class),context,mock(NationalInsuranceClient.class));
        assertSame(existing,service.quickPreSettle(3L,null,null,null,"NEW-KEY"));
        verify(transactions,never()).quickPreSettleContext(any(),any(),any(),any());
    }

    @Test void retriesPreSettlementOnceCredentialIsRefreshedForAnUncertainPendingClaim() {
        var transactions=mock(InsuranceClaimTransactionService.class);
        var context=mock(ExecutionContextProvider.class);
        when(context.requireCurrent()).thenReturn(new ExecutionContext(1L,2L,"cashier","corr",Set.of()));
        var pending=mock(com.rhn.billing.api.InsuranceResultDirectory.InsuranceSettlementView.class);
        when(pending.status()).thenReturn("PRE_SETTLEMENT_PENDING"); when(pending.currentOperation()).thenReturn("PRE_SETTLE");
        when(pending.errorCode()).thenReturn("INSURANCE_CHANNEL_UNCERTAIN"); when(pending.claimNo()).thenReturn("CLM-1");
        when(pending.responses()).thenReturn(List.of());
        var done=mock(com.rhn.billing.api.InsuranceResultDirectory.InsuranceSettlementView.class);
        when(transactions.existingClaimId(3L)).thenReturn(java.util.Optional.of(9L));
        when(transactions.view(eq(9L),anyBoolean())).thenReturn(pending).thenReturn(done);
        var instruction=mock(com.rhn.billing.api.InsuranceSettlementAdapter.InsuranceInstruction.class);
        when(transactions.instruction(9L)).thenReturn(instruction);
        var adapter=mock(com.rhn.billing.api.InsuranceSettlementAdapter.class);
        when(adapter.supports(any(),any())).thenReturn(true);
        var result=mock(com.rhn.billing.api.InsuranceSettlementAdapter.InsuranceResult.class);
        when(adapter.preSettle(instruction)).thenReturn(result);
        when(transactions.apply(eq(9L),eq("PRE_SETTLE"),eq(result),startsWith("PRE-R1-"),any(),eq(false)))
                .thenReturn(mock(InsuranceClaimTransactionService.ApplyResult.class));
        var service=new InsuranceClaimApplicationService(transactions,List.of(adapter),mock(ExternalMessageService.class),context,mock(NationalInsuranceClient.class));
        assertSame(done,service.quickPreSettle(3L,null,null,null,"NEW-KEY"));
        verify(adapter).preSettle(instruction);
    }

    @Test void retriesPreSettlementAfterAFailureThatNeverReachedTheInsurer() {
        var transactions=mock(InsuranceClaimTransactionService.class);
        var context=mock(ExecutionContextProvider.class);
        when(context.requireCurrent()).thenReturn(new ExecutionContext(1L,2L,"cashier","corr",Set.of()));
        var pending=mock(com.rhn.billing.api.InsuranceResultDirectory.InsuranceSettlementView.class);
        when(pending.status()).thenReturn("FAILED"); when(pending.currentOperation()).thenReturn("PRE_SETTLE");
        when(pending.errorCode()).thenReturn("CHS_REQUEST_CONTEXT_UNCONFIRMED"); when(pending.claimNo()).thenReturn("CLM-1");
        when(pending.responses()).thenReturn(List.of());
        var done=mock(com.rhn.billing.api.InsuranceResultDirectory.InsuranceSettlementView.class);
        when(transactions.existingClaimId(3L)).thenReturn(java.util.Optional.of(9L));
        when(transactions.view(eq(9L),anyBoolean())).thenReturn(pending).thenReturn(done);
        var instruction=mock(com.rhn.billing.api.InsuranceSettlementAdapter.InsuranceInstruction.class);
        when(transactions.instruction(9L)).thenReturn(instruction);
        var adapter=mock(com.rhn.billing.api.InsuranceSettlementAdapter.class);
        when(adapter.supports(any(),any())).thenReturn(true);
        var result=mock(com.rhn.billing.api.InsuranceSettlementAdapter.InsuranceResult.class);
        when(adapter.preSettle(instruction)).thenReturn(result);
        when(transactions.apply(eq(9L),eq("PRE_SETTLE"),eq(result),startsWith("PRE-R1-"),any(),eq(false)))
                .thenReturn(mock(InsuranceClaimTransactionService.ApplyResult.class));
        var service=new InsuranceClaimApplicationService(transactions,List.of(adapter),mock(ExternalMessageService.class),context,mock(NationalInsuranceClient.class));
        assertSame(done,service.quickPreSettle(3L,null,null,null,"NEW-KEY"));
        verify(transactions).prepareRetryPreSettle(9L);
        verify(adapter).preSettle(instruction);
    }
}
