package com.rhn.billing.infrastructure.payment;

import java.math.BigDecimal;
import java.math.RoundingMode;
import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;

final class PaymentProtocol {
    private PaymentProtocol() {}
    // Human-readable order numbers are tenant-scoped; channel numbers must be unique across a merchant account.
    static String number(Long paymentOrderId, boolean refund) {
        if (paymentOrderId == null) throw badRequest("PAYMENT_CHANNEL_ID_REQUIRED", "渠道支付必须关联支付指令");
        return (refund ? "R" : "P") + com.rhn.shared.id.GlobalIds.external(paymentOrderId);
    }
    static BigDecimal money(BigDecimal amount, String currency) {
        if (!"CNY".equals(currency)) throw badRequest("PAYMENT_CHANNEL_CURRENCY_UNSUPPORTED", "当前直连支付仅支持人民币");
        if (amount == null || amount.signum() <= 0) throw badRequest("PAYMENT_CHANNEL_AMOUNT_INVALID", "渠道支付金额必须大于零");
        try { return amount.setScale(2, RoundingMode.UNNECESSARY); }
        catch (ArithmeticException exception) { throw badRequest("PAYMENT_CHANNEL_AMOUNT_PRECISION", "渠道支付金额必须精确到分，不允许自动舍入"); }
    }
    static int cents(BigDecimal amount, String currency) {
        try { return money(amount, currency).movePointRight(2).intValueExact(); }
        catch (ArithmeticException exception) { throw badRequest("PAYMENT_CHANNEL_AMOUNT_LIMIT", "金额超出微信支付接口范围"); }
    }
    static BigDecimal amount(String value) { return value == null || value.isBlank() ? null : new BigDecimal(value); }
    static BigDecimal amount(Integer value) { return value == null ? null : BigDecimal.valueOf(value, 2); }
    static void same(String actual, String expected) {
        if (actual == null || !actual.equals(expected)) throw conflict("PAYMENT_CHANNEL_IDENTITY_MISMATCH", "渠道回执与原支付身份不一致，需继续核实");
    }
    static IllegalStateException uncertain() { return new IllegalStateException("支付渠道结果待确认，请查询原支付单，勿重复收款"); }
}
