package com.rhn.billing.infrastructure.payment;

import com.github.binarywang.wxpay.bean.request.WxPayMicropayRequest;
import com.github.binarywang.wxpay.bean.request.WxPayRefundRequest;
import com.github.binarywang.wxpay.bean.result.BaseWxPayResult;
import com.github.binarywang.wxpay.exception.WxPayException;
import com.rhn.billing.api.PaymentChannelAdapter;
import com.rhn.billing.infrastructure.payment.WechatPaymentProperties.WechatMerchant;
import com.rhn.billing.api.PaymentChannelCapabilities;
import static com.rhn.billing.infrastructure.payment.PaymentProtocol.*;

/** API v2 micropay (付款码), with mTLS refund and signed-response verification delegated to WxJava. */
public final class WechatPaymentChannelAdapter implements PaymentChannelAdapter {
    private final WechatPaymentClients clients;
    WechatPaymentChannelAdapter(WechatPaymentClients clients) { this.clients = clients; }
    @Override public java.util.Set<String> paymentMethods() { return java.util.Set.of("WECHAT"); }
    @Override public PaymentChannelCapabilities capabilities(String method) {
        return new PaymentChannelCapabilities("WECHAT_DIRECT", PaymentChannelCapabilities.PaymentInteraction.AUTHORIZATION_CODE,
                new PaymentChannelCapabilities.PaymentAuthorizationCodeRule("1[0-5][0-9]{16}", 18, 18), true, true, true);
    }
    @Override public boolean configured(Long tenantId, Long organizationId) { return clients.configured(tenantId, organizationId); }
    @Override public void validate(PaymentInstruction in) {
        clients.requireCollectionEnabled(in.tenantId(), in.organizationId());
        cents(in.amount(), in.currencyCode()); PaymentChannelAdapter.super.validate(in);
        clients.client(clients.merchant(in.tenantId(), in.organizationId()));
    }
    @Override public InitiationResult initiate(PaymentInstruction in) {
        validate(in);
        WechatMerchant merchant = clients.merchant(in.tenantId(), in.organizationId());
        var request = new WxPayMicropayRequest(); request.setOutTradeNo(number(in.paymentOrderId(), false));
        request.setBody("医疗费用"); request.setAuthCode(in.authorizationCode()); request.setFeeType("CNY");
        request.setTotalFee(cents(in.amount(), in.currencyCode())); request.setSpbillCreateIp(merchant.clientIp());
        try {
            var response = clients.client(merchant).micropay(request);
            identity(response, merchant); same(response.getOutTradeNo(), number(in.paymentOrderId(), false)); currency(response.getFeeType());
            return InitiationResult.succeeded(response.getOutTradeNo(), response.getTransactionId(), amount(response.getTotalFee()));
        } catch (WxPayException | RuntimeException exception) { throw uncertain(); }
    }
    @Override public RefundResult refund(RefundInstruction in) {
        WechatMerchant merchant = clients.merchant(in.tenantId(), in.organizationId());
        var request = new WxPayRefundRequest(); request.setTransactionId(in.originalExternalTransactionNo());
        request.setOutRefundNo(number(in.paymentOrderId(), true)); request.setRefundFee(cents(in.amount(), in.currencyCode()));
        request.setTotalFee(cents(in.originalAmount(), in.currencyCode())); request.setRefundFeeType("CNY");
        request.setRefundDesc("医疗费用退费");
        try {
            var response = clients.client(merchant).refundV2(request);
            identity(response, merchant); same(response.getTransactionId(), in.originalExternalTransactionNo());
            same(response.getOutRefundNo(), number(in.paymentOrderId(), true));
            return RefundResult.pending(response.getOutRefundNo());
        } catch (WxPayException | RuntimeException exception) { throw uncertain(); }
    }
    @Override public QueryResult query(QueryInstruction in) {
        money(in.expectedAmount(), in.currencyCode());
        if (in.externalOrderNo() != null) same(in.externalOrderNo(), number(in.paymentOrderId(), "REFUND".equals(in.orderType())));
        WechatMerchant merchant = clients.merchant(in.tenantId(), in.organizationId());
        try {
            if ("REFUND".equals(in.orderType())) return refundQuery(in, merchant);
            var response = clients.client(merchant).queryOrder(null, number(in.paymentOrderId(), false));
            identity(response, merchant); same(response.getOutTradeNo(), number(in.paymentOrderId(), false)); currency(response.getFeeType());
            return switch (response.getTradeState() == null ? "" : response.getTradeState()) {
                case "SUCCESS" -> QueryResult.succeeded(response.getOutTradeNo(), response.getTransactionId(), amount(response.getTotalFee()));
                case "CLOSED", "REVOKED" -> new QueryResult(QueryResult.Outcome.CANCELLED, response.getOutTradeNo(), null, null, null, null);
                case "PAYERROR" -> QueryResult.failed(response.getOutTradeNo(), "WECHAT_PAYERROR", "微信确认支付失败");
                // REFUND cannot serve as a new successful receipt.
                default -> QueryResult.pending(number(in.paymentOrderId(), false));
            };
        } catch (WxPayException | RuntimeException exception) { throw uncertain(); }
    }
    private QueryResult refundQuery(QueryInstruction in, WechatMerchant merchant) throws WxPayException {
        var response = clients.client(merchant).refundQuery(null, null, number(in.paymentOrderId(), true), null);
        identity(response, merchant); same(response.getTransactionId(), in.originalExternalTransactionNo()); currency(response.getFeeType());
        var records = response.getRefundRecords();
        if (records == null) return QueryResult.pending(number(in.paymentOrderId(), true));
        var matching = records.stream().filter(r -> number(in.paymentOrderId(), true).equals(r.getOutRefundNo())).toList();
        if (matching.size() != 1) return QueryResult.pending(number(in.paymentOrderId(), true));
        var record = matching.getFirst();
        return switch (record.getRefundStatus() == null ? "" : record.getRefundStatus()) {
            case "SUCCESS" -> QueryResult.succeeded(record.getOutRefundNo(), record.getRefundId(), amount(record.getRefundFee()));
            case "REFUNDCLOSE" -> QueryResult.failed(record.getOutRefundNo(), "WECHAT_REFUND_CLOSED", "微信确认退款已关闭");
            default -> QueryResult.pending(number(in.paymentOrderId(), true));
        };
    }
    private static void identity(BaseWxPayResult response, WechatMerchant merchant) {
        // WxJava validates a signature when present, but API v2's parser also accepts an absent sign.
        // No unsigned response may release a reservation or become a financial fact.
        if (response.getSign() == null || response.getSign().isBlank()
                || !"SUCCESS".equals(response.getReturnCode()) || !"SUCCESS".equals(response.getResultCode())) throw uncertain();
        same(response.getAppid(), merchant.appId()); same(response.getMchId(), merchant.merchantId());
        if (response.getSubMchId() != null && !response.getSubMchId().isBlank()) throw uncertain();
    }
    // API v2 defines omitted fee_type as CNY.
    private static void currency(String reported) { if (reported != null && !reported.isBlank()) same(reported, "CNY"); }
}
