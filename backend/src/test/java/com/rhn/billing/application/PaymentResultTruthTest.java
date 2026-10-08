package com.rhn.billing.application;

import com.rhn.billing.api.PaymentChannelAdapter;
import com.rhn.billing.api.PaymentResultDirectory.VerifiedPaymentResult;
import com.rhn.billing.domain.PaymentEvent;
import com.rhn.billing.domain.PaymentOrder;
import com.rhn.platform.integration.api.ExternalMessageService;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.context.ExecutionContextProvider;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import java.math.BigDecimal;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class PaymentResultTruthTest {
    final PaymentOrderTransactionService transactions = mock(PaymentOrderTransactionService.class);
    final BillingApplicationService billing = mock(BillingApplicationService.class);
    final ExternalMessageService messages = mock(ExternalMessageService.class);
    final PaymentResultTransactionService service = new PaymentResultTransactionService(transactions, billing, messages, mock(ExecutionContextProvider.class));

    PaymentOrder order(boolean refund) {
        var order = new PaymentOrder(1L,2L,3L,4L,5L,refund ? 6L : null,"ORDER","KEY","OUTPATIENT","CASHIER",
                "CASH","现金",refund ? "REFUND" : "SETTLEMENT_PAY",new BigDecimal("10"),"CNY","corr",null,null,7L);
        when(transactions.lock(order.id())).thenReturn(order);
        when(transactions.lockByOrderNo("ORDER")).thenReturn(order);
        return order;
    }
    void complete(PaymentOrder order, boolean refund, BigDecimal amount, String external, String transaction) {
        if(refund) service.completeRefund(order.id(),"reason","CMD",null,external,transaction,amount);
        else service.completePayment(order.id(),"CMD",null,external,transaction,amount);
    }
    @ParameterizedTest @ValueSource(booleans={false,true})
    void successCannotBorrowTheRequestedAmount(boolean refund) {
        var order=order(refund);
        assertEquals("PAYMENT_RESULT_AMOUNT_REQUIRED", assertThrows(BusinessException.class,
                ()->complete(order,refund,null,"EXT","TXN")).code());
        verifyNoInteractions(billing,messages);
        verify(transactions,never()).transition(anyLong(),any());
        verify(transactions,never()).transitionRefund(anyLong(),any());
    }
    @ParameterizedTest @ValueSource(booleans={false,true})
    void rejectsNonpositiveMismatchedAndInexactAmountsBeforeAccounting(boolean refund) {
        var order=order(refund);
        for(String value:new String[]{"-1","0","9","11","10.0000001"}) {
            assertThrows(BusinessException.class,()->complete(order,refund,new BigDecimal(value),"EXT","TXN"));
        }
        verifyNoInteractions(billing,messages);
        verify(transactions,never()).transition(anyLong(),any());
        verify(transactions,never()).transitionRefund(anyLong(),any());
    }
    @ParameterizedTest @ValueSource(booleans={false,true})
    void successRequiresActualOrderAndTransactionIdentifiers(boolean refund) {
        var order=order(refund);
        assertEquals("PAYMENT_RESULT_ORDER_REQUIRED",assertThrows(BusinessException.class,
                ()->complete(order,refund,BigDecimal.TEN,null,"TXN")).code());
        assertEquals("PAYMENT_RESULT_TRANSACTION_REQUIRED",assertThrows(BusinessException.class,
                ()->complete(order,refund,BigDecimal.TEN,"EXT"," ")).code());
        verifyNoInteractions(billing,messages);
    }
    @Test void callbackCannotBorrowCurrencyFromTheOrder() {
        order(false);
        for(String currency:new String[]{null," ","USD"}) {
            var input=new VerifiedPaymentResult("CASH","MSG","CMD","ORDER","EXT","TXN",
                    VerifiedPaymentResult.ResultStatus.SUCCEEDED,BigDecimal.TEN,currency,null,null,null);
            assertThrows(BusinessException.class,()->service.accept(input));
        }
        verifyNoInteractions(billing,messages);
    }
    @Test void missingCallbackIdentityAndStatusAreRejectedBeforeMessageStorage() {
        assertThrows(BusinessException.class,()->service.accept(null));
        assertThrows(BusinessException.class,()->service.accept(new VerifiedPaymentResult("CASH","MSG","CMD","ORDER","EXT","TXN",null,null,null,null,null,null)));
        assertThrows(BusinessException.class,()->service.accept(new VerifiedPaymentResult("CASH",null,"CMD","ORDER","EXT","TXN",VerifiedPaymentResult.ResultStatus.PENDING,null,null,null,null,null)));
        assertThrows(BusinessException.class,()->service.accept(new VerifiedPaymentResult("CASH","MSG",null,"ORDER","EXT","TXN",VerifiedPaymentResult.ResultStatus.PENDING,null,null,null,null,null)));
        verifyNoInteractions(transactions,billing,messages);
    }
    @Test void paymentEventReplayIncludesAmountStateAndTransactionFacts() {
        var event=new PaymentEvent(1L,2L,3L,"CAPTURE","PENDING","SUCCEEDED","CMD","TXN",BigDecimal.TEN,null,null,4L);
        assertTrue(event.matches("CAPTURE","SUCCEEDED","TXN",new BigDecimal("10.000000"),null,null));
        assertFalse(event.matches("CAPTURE","SUCCEEDED","TXN",null,null,null));
        assertFalse(event.matches("CAPTURE","SUCCEEDED","OTHER",BigDecimal.TEN,null,null));
        assertFalse(event.matches("CAPTURE","PENDING","TXN",BigDecimal.TEN,null,null));
        assertFalse(event.matches("CAPTURE","SUCCEEDED","TXN",BigDecimal.ONE,null,null));
        var pending=new PaymentEvent(1L,2L,3L,"CALLBACK","CREATED","PENDING","CMD",null,null,null,null,4L);
        assertFalse(pending.matches("CALLBACK","PENDING",null,BigDecimal.ZERO,null,null));
    }
    @Test void cashRecoveryCannotInventASuccessFromTheRequestedAmount() {
        var instruction=new PaymentChannelAdapter.QueryInstruction(1L,"ORDER","SETTLEMENT_PAY","CASH",null,BigDecimal.TEN,"CNY","corr",null);
        assertEquals("CASH_RESULT_REQUIRES_RECONCILIATION",assertThrows(BusinessException.class,
                ()->new CashPaymentChannelAdapter().query(instruction)).code());
    }
}
