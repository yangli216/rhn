package com.rhn.billing.application;

import com.rhn.billing.api.PaymentChannelAdapter;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AggregatedPaymentChannelAdapterTest {

    private final AggregatedPaymentChannelAdapter adapter = new AggregatedPaymentChannelAdapter();

    @Test
    void supportsOnlyWechatAndAlipay() {
        assertTrue(adapter.supports("WECHAT"));
        assertTrue(adapter.supports("wechat"));
        assertTrue(adapter.supports("ALIPAY"));
        assertTrue(adapter.supports("alipay"));
        assertFalse(adapter.supports("CASH"));
        assertFalse(adapter.supports("BANK_CARD"));
        assertFalse(adapter.supports(null));
    }

    @Test
    void initiateInstantPaymentGeneratesSuccessResult() {
        var instruction = new PaymentChannelAdapter.PaymentInstruction(
                1L, "PO1001", "KEY-1", 10L, 20L, "OUTPATIENT", "CASHIER",
                "WECHAT", new BigDecimal("50.00"), "CNY", "CORR-1", "CASHIER-WEB", Instant.now().plusSeconds(60));

        var result = adapter.initiate(instruction);
        assertEquals(PaymentChannelAdapter.InitiationResult.Outcome.SUCCEEDED, result.outcome());
        assertEquals("WECHAT-EXT-PO1001", result.externalOrderNo());
        assertTrue(result.externalTransactionNo().startsWith("WECHAT-TXN-"));
        assertEquals(new BigDecimal("50.00"), result.capturedAmount());
    }

    @Test
    void initiateDynamicQrGeneratesPendingResult() {
        var instruction = new PaymentChannelAdapter.PaymentInstruction(
                2L, "PO1002", "KEY-2", 10L, 20L, "OUTPATIENT", "CASHIER",
                "ALIPAY", new BigDecimal("88.00"), "CNY", "CORR-2", "CASHIER-DYNAMIC_QR", Instant.now().plusSeconds(60));

        var result = adapter.initiate(instruction);
        assertEquals(PaymentChannelAdapter.InitiationResult.Outcome.PENDING, result.outcome());
        assertEquals("ALIPAY-QR-PO1002", result.externalOrderNo());
    }

    @Test
    void queryAndRefundSucceeds() {
        var queryInstruction = new PaymentChannelAdapter.QueryInstruction(
                3L, "PO1003", "SETTLEMENT_PAY", "WECHAT", "WECHAT-EXT-PO1003",
                new BigDecimal("30.00"), "CNY", "CORR-3", "CASHIER-WEB");
        var queryResult = adapter.query(queryInstruction);
        assertEquals(PaymentChannelAdapter.QueryResult.Outcome.SUCCEEDED, queryResult.outcome());
        assertEquals("WECHAT-EXT-PO1003", queryResult.externalOrderNo());
        assertEquals(new BigDecimal("30.00"), queryResult.completedAmount());

        var refundInstruction = new PaymentChannelAdapter.RefundInstruction(
                4L, "RO1004", "RF-KEY-4", 100L, "PAY-100", "TXN-100",
                "OUTPATIENT", "CASHIER", "ALIPAY", new BigDecimal("30.00"), "CNY",
                "患者要求退费", "CORR-4", "CASHIER-WEB");
        var refundResult = adapter.refund(refundInstruction);
        assertEquals(PaymentChannelAdapter.RefundResult.Outcome.SUCCEEDED, refundResult.outcome());
        assertEquals("ALIPAY-RF-EXT-RO1004", refundResult.externalOrderNo());
        assertEquals(new BigDecimal("30.00"), refundResult.refundedAmount());
    }
}
