package com.rhn.billing.infrastructure.payment;

import com.alipay.api.AlipayApiException;
import com.alipay.api.AlipayRequest;
import com.alipay.api.AlipayResponse;
import com.alipay.api.domain.AlipayTradePayModel;
import com.alipay.api.domain.AlipayTradeQueryModel;
import com.alipay.api.domain.AlipayTradeRefundModel;
import com.alipay.api.domain.AlipayTradeFastpayRefundQueryModel;
import com.alipay.api.request.AlipayTradePayRequest;
import com.alipay.api.request.AlipayTradeQueryRequest;
import com.alipay.api.request.AlipayTradeRefundRequest;
import com.alipay.api.request.AlipayTradeFastpayRefundQueryRequest;
import com.rhn.billing.api.PaymentChannelAdapter;
import com.rhn.billing.infrastructure.payment.AlipayPaymentProperties.AlipayMerchant;
import com.rhn.billing.api.PaymentChannelCapabilities;
import static com.rhn.billing.infrastructure.payment.PaymentProtocol.*;

/** Face-to-face barcode payment. Official SDK authenticates synchronous responses. */
public final class AlipayPaymentChannelAdapter implements PaymentChannelAdapter {
    private final AlipayPaymentClients clients;
    AlipayPaymentChannelAdapter(AlipayPaymentClients clients) { this.clients = clients; }
    @Override public java.util.Set<String> paymentMethods() { return java.util.Set.of("ALIPAY"); }
    @Override public PaymentChannelCapabilities capabilities(String method) {
        return new PaymentChannelCapabilities("ALIPAY_DIRECT", PaymentChannelCapabilities.PaymentInteraction.AUTHORIZATION_CODE,
                new PaymentChannelCapabilities.PaymentAuthorizationCodeRule("(?:2[5-9]|30)[0-9]{14,22}", 16, 24), true, true, true);
    }
    @Override public boolean configured(Long tenantId, Long organizationId) { return clients.configured(tenantId, organizationId); }
    @Override public void validate(PaymentInstruction in) {
        clients.requireCollectionEnabled(in.tenantId(), in.organizationId());
        money(in.amount(), in.currencyCode()); PaymentChannelAdapter.super.validate(in);
        clients.client(clients.merchant(in.tenantId(), in.organizationId()));
    }
    @Override public InitiationResult initiate(PaymentInstruction in) {
        validate(in);
        AlipayMerchant merchant = clients.merchant(in.tenantId(), in.organizationId());
        var model = new AlipayTradePayModel();
        model.setOutTradeNo(number(in.paymentOrderId(), false)); model.setScene("bar_code"); model.setAuthCode(in.authorizationCode());
        model.setSellerId(merchant.merchantId()); model.setSubject("医疗费用");
        model.setTotalAmount(money(in.amount(), in.currencyCode()).toPlainString());
        var request = new AlipayTradePayRequest(); request.setBizModel(model);
        var response = execute(merchant, request);
        if (!"10000".equals(response.getCode())) return InitiationResult.pending(number(in.paymentOrderId(), false));
        same(response.getOutTradeNo(), number(in.paymentOrderId(), false));
        if (response.getTransCurrency() != null) same(response.getTransCurrency(), "CNY");
        return InitiationResult.succeeded(response.getOutTradeNo(), response.getTradeNo(), amount(response.getTotalAmount()));
    }
    @Override public RefundResult refund(RefundInstruction in) {
        money(in.amount(), in.currencyCode());
        AlipayMerchant merchant = clients.merchant(in.tenantId(), in.organizationId());
        var model = new AlipayTradeRefundModel();
        model.setTradeNo(in.originalExternalTransactionNo()); model.setOutRequestNo(number(in.paymentOrderId(), true));
        model.setRefundAmount(in.amount().setScale(2).toPlainString()); model.setRefundReason("医疗费用退费");
        var request = new AlipayTradeRefundRequest(); request.setBizModel(model);
        var response = execute(merchant, request);
        if ("10000".equals(response.getCode())) same(response.getTradeNo(), in.originalExternalTransactionNo());
        return RefundResult.pending(number(in.paymentOrderId(), true));
    }
    @Override public QueryResult query(QueryInstruction in) {
        money(in.expectedAmount(), in.currencyCode());
        if (in.externalOrderNo() != null) same(in.externalOrderNo(), number(in.paymentOrderId(), "REFUND".equals(in.orderType())));
        AlipayMerchant merchant = clients.merchant(in.tenantId(), in.organizationId());
        if ("REFUND".equals(in.orderType())) return refundQuery(in, merchant);
        var model = new AlipayTradeQueryModel(); model.setOutTradeNo(number(in.paymentOrderId(), false));
        var request = new AlipayTradeQueryRequest(); request.setBizModel(model);
        var response = execute(merchant, request);
        if (!"10000".equals(response.getCode())) return QueryResult.pending(number(in.paymentOrderId(), false));
        same(response.getOutTradeNo(), number(in.paymentOrderId(), false));
        if (response.getTransCurrency() != null) same(response.getTransCurrency(), "CNY");
        return switch (response.getTradeStatus() == null ? "" : response.getTradeStatus()) {
            case "TRADE_SUCCESS", "TRADE_FINISHED" -> QueryResult.succeeded(response.getOutTradeNo(), response.getTradeNo(), amount(response.getTotalAmount()));
            case "TRADE_CLOSED" -> new QueryResult(QueryResult.Outcome.CANCELLED, response.getOutTradeNo(), null, null, null, null);
            default -> QueryResult.pending(number(in.paymentOrderId(), false));
        };
    }
    private QueryResult refundQuery(QueryInstruction in, AlipayMerchant merchant) {
        var model = new AlipayTradeFastpayRefundQueryModel();
        model.setTradeNo(in.originalExternalTransactionNo()); model.setOutRequestNo(number(in.paymentOrderId(), true));
        var request = new AlipayTradeFastpayRefundQueryRequest(); request.setBizModel(model);
        var response = execute(merchant, request);
        if (!"10000".equals(response.getCode())) return QueryResult.pending(number(in.paymentOrderId(), true));
        same(response.getOutRequestNo(), number(in.paymentOrderId(), true)); same(response.getTradeNo(), in.originalExternalTransactionNo());
        if (!"REFUND_SUCCESS".equals(response.getRefundStatus())) return QueryResult.pending(number(in.paymentOrderId(), true));
        // Alipay's refund identity is original trade + out_request_no, rather than a separate refund_id.
        return QueryResult.succeeded(response.getOutRequestNo(), response.getTradeNo() + "/" + response.getOutRequestNo(), amount(response.getRefundAmount()));
    }
    private <T extends AlipayResponse> T execute(AlipayMerchant merchant, AlipayRequest<T> request) {
        var client = clients.client(merchant);
        try { return clients.certificateMode(merchant) ? client.certificateExecute(request) : client.execute(request); }
        catch (AlipayApiException | RuntimeException exception) { throw uncertain(); }
    }
}
