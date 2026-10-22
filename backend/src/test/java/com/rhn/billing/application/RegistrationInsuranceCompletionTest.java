package com.rhn.billing.application;

import com.rhn.billing.api.InsuranceResultDirectory.InsuranceSettlementView;
import com.rhn.billing.api.PaymentResultDirectory.PaymentOrderView;
import com.rhn.billing.infrastructure.insurance.chs.NationalInsuranceClient;
import com.rhn.platform.integration.api.ExternalMessageService;
import com.rhn.shared.api.BusinessErrors;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/** 挂号医保：医保资金结清结算单后补触发建就诊；退号先冲正医保再退个人实付。 */
class RegistrationInsuranceCompletionTest {
    private static InsuranceClaimApplicationService claimService(InsuranceClaimTransactionService transactions,
                                                                 RegistrationBillingService registrations) {
        var context = mock(ExecutionContextProvider.class);
        when(context.requireCurrent()).thenReturn(new ExecutionContext(1L, 2L, "front-desk", "corr", Set.of()));
        var service = new InsuranceClaimApplicationService(transactions, List.of(), mock(ExternalMessageService.class),
                context, mock(NationalInsuranceClient.class));
        service.setRegistrations(registrations);
        return service;
    }

    @Test void replayedSettleStillTriggersRegistrationCompletionWhenSettled() {
        var transactions = mock(InsuranceClaimTransactionService.class);
        var registrations = mock(RegistrationBillingService.class);
        var view = mock(InsuranceSettlementView.class);
        when(view.status()).thenReturn("SETTLED"); when(view.settlementId()).thenReturn(9L);
        when(transactions.responseApplied(eq7(), anyString())).thenReturn(true);
        when(transactions.view(7L, true)).thenReturn(view);

        assertSame(view, claimService(transactions, registrations).settle(7L, "SETTLE-CMD"));
        verify(registrations).completeIfSettled(9L);
    }

    @Test void pendingOrFailedSettlementDoesNotCompleteRegistrationAndCompletionErrorsDoNotHideTheInsuranceResult() {
        var transactions = mock(InsuranceClaimTransactionService.class);
        var registrations = mock(RegistrationBillingService.class);
        var pending = mock(InsuranceSettlementView.class);
        when(pending.status()).thenReturn("SETTLEMENT_PENDING");
        when(transactions.responseApplied(eq7(), anyString())).thenReturn(true);
        when(transactions.view(7L, true)).thenReturn(pending);
        assertSame(pending, claimService(transactions, registrations).settle(7L, "A"));
        verifyNoInteractions(registrations);

        var settled = mock(InsuranceSettlementView.class);
        when(settled.status()).thenReturn("SETTLED"); when(settled.settlementId()).thenReturn(9L);
        when(transactions.view(7L, true)).thenReturn(settled);
        doThrow(BusinessErrors.conflict("REGISTRATION_COMPLETION_FAILED", "号源已满")).when(registrations).completeIfSettled(9L);
        assertSame(settled, claimService(transactions, registrations).settle(7L, "B"));
    }

    @Test void cancellationReversesInsuranceBeforeRefundingOnlyThePatientPaidPart() {
        var intents = mock(RegistrationBillingIntentTransactionService.class);
        var payments = mock(PaymentOrchestrationService.class);
        var claims = mock(InsuranceClaimApplicationService.class);
        var reversed = mock(InsuranceSettlementView.class);
        when(reversed.status()).thenReturn("REVERSED");
        when(intents.prepareCancellation(11L)).thenReturn(new RegistrationBillingIntentTransactionService.CancellationPlan(
                5L, "CANCELLATION_PENDING", new BigDecimal("3.000000"), "CNY", 8L, false, 6L));
        when(claims.reverse(6L, "REG-CANCEL-INS-11-CMD", "患者取消")).thenReturn(reversed);
        var refund = mock(PaymentOrderView.class);
        when(refund.status()).thenReturn("REFUNDED"); when(refund.id()).thenReturn(99L);
        when(payments.refund(any())).thenReturn(refund);

        var result = new RegistrationCancellationBillingService(intents, payments, claims).cancelBeforeService(11L, "CMD", "患者取消", "T");

        assertTrue(result.readyToClose());
        var order = inOrder(claims, payments);
        order.verify(claims).reverse(6L, "REG-CANCEL-INS-11-CMD", "患者取消");
        var captor = org.mockito.ArgumentCaptor.forClass(PaymentOrchestrationService.CreateRefundOrderCommand.class);
        order.verify(payments).refund(captor.capture());
        assertEquals(new BigDecimal("3.000000"), captor.getValue().amount());
        verify(intents).markCancellationCompleted(5L);
    }

    @Test void cancellationStopsWithoutRefundWhenInsuranceReversalIsNotConfirmed() {
        var intents = mock(RegistrationBillingIntentTransactionService.class);
        var payments = mock(PaymentOrchestrationService.class);
        var claims = mock(InsuranceClaimApplicationService.class);
        var pending = mock(InsuranceSettlementView.class);
        when(pending.status()).thenReturn("REVERSAL_PENDING");
        when(intents.prepareCancellation(11L)).thenReturn(new RegistrationBillingIntentTransactionService.CancellationPlan(
                5L, "CANCELLATION_PENDING", new BigDecimal("3.000000"), "CNY", 8L, false, 6L));
        when(claims.reverse(anyLong(), anyString(), anyString())).thenReturn(pending);

        var result = new RegistrationCancellationBillingService(intents, payments, claims).cancelBeforeService(11L, "CMD", "患者取消", "T");

        assertFalse(result.readyToClose());
        verifyNoInteractions(payments);
        verify(intents).markCancellationFailed(eq(5L), anyString(), anyString());
    }

    @Test void failedRefundIsRetriedWithNewAttemptKeyWhilePendingRefundKeepsTheSameKey() {
        var intents = mock(RegistrationBillingIntentTransactionService.class);
        var payments = mock(PaymentOrchestrationService.class);
        var claims = mock(InsuranceClaimApplicationService.class);
        when(intents.prepareCancellation(11L)).thenReturn(new RegistrationBillingIntentTransactionService.CancellationPlan(
                5L, "CANCELLATION_FAILED", new BigDecimal("3.000000"), "CNY", 8L, false));
        var failed = mock(PaymentOrderView.class);
        when(failed.status()).thenReturn("FAILED");
        var pending = mock(PaymentOrderView.class);
        when(pending.status()).thenReturn("REFUNDING"); when(pending.id()).thenReturn(98L);
        when(payments.findExistingRefund(any())).thenAnswer(invocation -> {
            String key = ((PaymentOrchestrationService.CreateRefundOrderCommand) invocation.getArgument(0)).idempotencyKey();
            return key.equals("REG-CANCEL-11-CMD") ? java.util.Optional.of(failed) : java.util.Optional.empty();
        });
        when(payments.refund(any())).thenReturn(pending);

        var result = new RegistrationCancellationBillingService(intents, payments, claims)
                .cancelBeforeService(11L, "CMD", "患者取消", "T");

        var captor = org.mockito.ArgumentCaptor.forClass(PaymentOrchestrationService.CreateRefundOrderCommand.class);
        verify(payments).refund(captor.capture());
        assertEquals("REG-CANCEL-11-CMD-R1", captor.getValue().idempotencyKey());
        assertEquals("CANCELLATION_PENDING", result.billingStatus());

        // 处理中的订单：沿用原键，交给幂等回放
        doReturn(java.util.Optional.of(pending)).when(payments).findExistingRefund(any());
        new RegistrationCancellationBillingService(intents, payments, claims).cancelBeforeService(11L, "CMD", "患者取消", "T");
        verify(payments, times(2)).refund(captor.capture());
        assertEquals("REG-CANCEL-11-CMD", captor.getValue().idempotencyKey());
    }

    @Test void failedInsuranceReversalRetriesWithRevisionScopedCommand() {
        var intents = mock(RegistrationBillingIntentTransactionService.class);
        var payments = mock(PaymentOrchestrationService.class);
        var claims = mock(InsuranceClaimApplicationService.class);
        var failedClaim = mock(InsuranceSettlementView.class);
        when(failedClaim.status()).thenReturn("FAILED"); when(failedClaim.currentOperation()).thenReturn("REVERSE");
        when(failedClaim.revision()).thenReturn(7L);
        var reversed = mock(InsuranceSettlementView.class);
        when(reversed.status()).thenReturn("REVERSED");
        when(intents.prepareCancellation(11L)).thenReturn(new RegistrationBillingIntentTransactionService.CancellationPlan(
                5L, "CANCELLATION_FAILED", BigDecimal.ZERO.setScale(6), "CNY", null, false, 6L));
        when(claims.get(6L)).thenReturn(failedClaim);
        when(claims.reverse(anyLong(), anyString(), anyString())).thenReturn(reversed);

        new RegistrationCancellationBillingService(intents, payments, claims).cancelBeforeService(11L, "CMD", "取消", "T");

        verify(claims).reverse(6L, "REG-CANCEL-INS-11-CMD-R7", "取消");
    }

    @Test void fullyInsuranceCoveredRegistrationNeedsNoRefundAfterReversal() {
        var intents = mock(RegistrationBillingIntentTransactionService.class);
        var payments = mock(PaymentOrchestrationService.class);
        var claims = mock(InsuranceClaimApplicationService.class);
        var reversed = mock(InsuranceSettlementView.class);
        when(reversed.status()).thenReturn("REVERSED");
        when(intents.prepareCancellation(11L)).thenReturn(new RegistrationBillingIntentTransactionService.CancellationPlan(
                5L, "CANCELLATION_PENDING", BigDecimal.ZERO.setScale(6), "CNY", null, false, 6L));
        when(claims.reverse(anyLong(), anyString(), anyString())).thenReturn(reversed);

        var result = new RegistrationCancellationBillingService(intents, payments, claims).cancelBeforeService(11L, "CMD", "取消", "T");

        assertTrue(result.readyToClose());
        assertEquals("CANCELLED", result.billingStatus());
        verifyNoInteractions(payments);
        verify(intents).markCancellationCompleted(5L);
    }

    @Test void cancelingAnUnpaidIntentReversesAnAlreadySettledInsuranceClaimFirst() {
        var intents = mock(RegistrationBillingIntentTransactionService.class);
        var claims = mock(InsuranceClaimApplicationService.class);
        var service = new RegistrationCancellationBillingService(intents, mock(PaymentOrchestrationService.class), claims);
        when(intents.insuranceClaimToReverse(5L)).thenReturn(6L);
        var pending = mock(InsuranceSettlementView.class);
        when(pending.status()).thenReturn("REVERSAL_PENDING");
        when(claims.reverse(6L, "REG-INTENT-CANCEL-5", "取消挂号")).thenReturn(pending);
        assertEquals("REGISTRATION_INSURANCE_REVERSAL_PENDING",
                assertThrows(com.rhn.shared.api.BusinessException.class, () -> service.cancelIntent(5L)).code());
        verify(intents, never()).cancel(anyLong());

        var reversed = mock(InsuranceSettlementView.class);
        when(reversed.status()).thenReturn("REVERSED");
        when(claims.reverse(6L, "REG-INTENT-CANCEL-5", "取消挂号")).thenReturn(reversed);
        service.cancelIntent(5L);
        verify(intents).cancel(5L);

        when(intents.insuranceClaimToReverse(7L)).thenReturn(null);
        service.cancelIntent(7L);
        verify(intents).cancel(7L);
        verify(claims, times(2)).reverse(anyLong(), anyString(), anyString());
    }

    private static Long eq7() { return org.mockito.ArgumentMatchers.eq(7L); }
}
