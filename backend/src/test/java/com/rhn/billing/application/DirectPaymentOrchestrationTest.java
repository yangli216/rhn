package com.rhn.billing.application;

import com.rhn.billing.api.PaymentChannelAdapter;
import com.rhn.billing.domain.PaymentOrder;
import com.rhn.platform.integration.api.ExternalMessageService;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.util.List;
import java.util.Set;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class DirectPaymentOrchestrationTest {
    final PaymentOrderTransactionService transactions=mock(PaymentOrderTransactionService.class);
    final PaymentResultTransactionService results=mock(PaymentResultTransactionService.class);
    final ExternalMessageService messages=mock(ExternalMessageService.class);
    final ExecutionContextProvider contexts=mock(ExecutionContextProvider.class);
    final PaymentChannelAdapter adapter=mock(PaymentChannelAdapter.class);
    final PaymentOrchestrationService service=new PaymentOrchestrationService(transactions,results,messages,contexts,new PaymentChannelRegistry(java.util.List.of(declaredAdapter()),false),List.of());
    final PaymentOrder order=new PaymentOrder(1L,2L,3L,4L,5L,null,"ORDER","KEY","OUTPATIENT","CASHIER","WECHAT","微信支付","SETTLEMENT_PAY",BigDecimal.TEN,"CNY","corr","TERMINAL",null,7L);
    PaymentChannelAdapter declaredAdapter() {
        when(adapter.paymentMethods()).thenReturn(Set.of("WECHAT"));
        when(adapter.capabilities("WECHAT")).thenReturn(new com.rhn.billing.api.PaymentChannelCapabilities("TEST", com.rhn.billing.api.PaymentChannelCapabilities.PaymentInteraction.AUTHORIZATION_CODE,
                new com.rhn.billing.api.PaymentChannelCapabilities.PaymentAuthorizationCodeRule("1[0-5][0-9]{16}",18,18),true,true,true));
        return adapter;
    }
    DirectPaymentOrchestrationTest() {

        when(transactions.create(any())).thenReturn(new PaymentOrderTransactionService.CreateResult(order,false));
        when(transactions.require(order.id())).thenReturn(order);
        when(contexts.requireCurrent()).thenReturn(new ExecutionContext(9L,9L,"operator","corr",Set.of()));
    }
    PaymentOrchestrationService.CreatePaymentOrderCommand command() {
        return new PaymentOrchestrationService.CreatePaymentOrderCommand(5L,"KEY","OUTPATIENT","CASHIER","WECHAT",BigDecimal.TEN,null,"corr","TERMINAL",null,"134567890123456789");
    }
    @Test void invalidPreflightFailsWithoutDispatchingOrAccounting() {
        doThrow(com.rhn.shared.api.BusinessErrors.badRequest("PAYMENT_CREDENTIAL_INVALID","配置不可用")).when(adapter).validate(any());
        service.create(command());
        verify(adapter,never()).initiate(any());verifyNoInteractions(results,messages);
        verify(transactions).transition(eq(order.id()),argThat(c->"FAILED".equals(c.nextStatus())));
    }
    @Test void usesTheOrderInstitutionAndKeepsTheAuthorizationCodeOutOfPersistentCommands() {
        when(adapter.initiate(any())).thenReturn(PaymentChannelAdapter.InitiationResult.pending("ORDER"));
        service.create(command());
        verify(adapter).initiate(argThat(in->in.tenantId()==1L && in.organizationId()==2L && "134567890123456789".equals(in.authorizationCode())));
        verify(transactions).create(argThat(in->!in.toString().contains("134567890123456789")));
        verifyNoInteractions(messages,results);
    }
    @Test void cancelOfAnUncertainDirectPaymentQueriesInsteadOfReleasingTheReservation() {
        order.transition("PENDING",null,"ORDER",null,null);

        when(adapter.query(any())).thenReturn(PaymentChannelAdapter.QueryResult.pending("ORDER"));
        service.cancel(order.id());
        verify(adapter).query(any());
        verify(transactions,never()).transition(anyLong(),argThat(c->"CANCELLED".equals(c.nextStatus())));
        verifyNoInteractions(results);
    }
    @Test void duplicateCreationNeverResubmitsAOneTimeAuthorizationCode() {
        when(transactions.create(any())).thenReturn(new PaymentOrderTransactionService.CreateResult(order,true));
        service.create(command());verify(adapter,never()).initiate(any());verifyNoInteractions(results,messages);
    }
    @Test void undeclaredPaymentMethodCannotReserveMoney() {
        var command=new PaymentOrchestrationService.CreatePaymentOrderCommand(5L,"KEY","OUTPATIENT","CASHIER","UNREGISTERED",BigDecimal.TEN,null,"corr","TERMINAL",null,null);
        org.junit.jupiter.api.Assertions.assertThrows(com.rhn.shared.api.BusinessException.class,()->service.create(command));
        verifyNoInteractions(transactions,results,messages);
    }
    @Test void unsupportedRefundIsRejectedBeforeCreatingARefundReservation() {
        when(transactions.refundPaymentMethod(6L)).thenReturn("WECHAT");
        when(adapter.capabilities("WECHAT")).thenReturn(new com.rhn.billing.api.PaymentChannelCapabilities("TEST",com.rhn.billing.api.PaymentChannelCapabilities.PaymentInteraction.DIRECT,null,true,false,true));
        org.junit.jupiter.api.Assertions.assertThrows(com.rhn.shared.api.BusinessException.class,()->service.refund(
                new PaymentOrchestrationService.CreateRefundOrderCommand(6L,"REFUND-KEY",BigDecimal.ONE,"reason","corr","TERMINAL")));
        verify(transactions,never()).createRefund(any());verify(adapter,never()).refund(any());verifyNoInteractions(results,messages);
    }

    @Test void aNewBarcodeProviderUsesTheUnchangedPaymentOrchestration() {
        var provider=mock(PaymentChannelAdapter.class);
        when(provider.paymentMethods()).thenReturn(Set.of("NEW_BARCODE"));
        when(provider.capabilities("NEW_BARCODE")).thenReturn(new com.rhn.billing.api.PaymentChannelCapabilities("NEW_PROVIDER",
                com.rhn.billing.api.PaymentChannelCapabilities.PaymentInteraction.AUTHORIZATION_CODE,
                new com.rhn.billing.api.PaymentChannelCapabilities.PaymentAuthorizationCodeRule("[A-Z0-9]{8}",8,8),true,true,true));
        when(provider.initiate(any())).thenReturn(PaymentChannelAdapter.InitiationResult.pending("EXTERNAL"));
        var order=new PaymentOrder(1L,2L,3L,4L,5L,null,"ORDER","KEY","OUTPATIENT","CASHIER","NEW_BARCODE","新增支付",
                "SETTLEMENT_PAY",BigDecimal.TEN,"CNY","corr","TERMINAL",null,7L);
        when(transactions.create(any())).thenReturn(new PaymentOrderTransactionService.CreateResult(order,false));
        var genericService=new PaymentOrchestrationService(transactions,results,messages,contexts,new PaymentChannelRegistry(List.of(provider),false),List.of());
        genericService.create(new PaymentOrchestrationService.CreatePaymentOrderCommand(5L,"KEY","OUTPATIENT","CASHIER","NEW_BARCODE",BigDecimal.TEN,null,"corr","TERMINAL",null,"ABC12345"));
        verify(provider).initiate(argThat(in->"NEW_BARCODE".equals(in.paymentMethodCode()) && "ABC12345".equals(in.authorizationCode())));
        verify(transactions).transition(eq(order.id()),argThat(c->"PENDING".equals(c.nextStatus())));
        verifyNoInteractions(results,messages);
    }
    @Test void externalMessageHandoffCannotDiscardAnUndeclaredOneTimeAuthorizationCode() {
        var external=new PaymentOrchestrationService(transactions,results,messages,contexts,new PaymentChannelRegistry(List.of(),true),List.of());
        org.junit.jupiter.api.Assertions.assertThrows(com.rhn.shared.api.BusinessException.class,()->external.create(command()));
        verifyNoInteractions(transactions,results,messages);
    }

}
