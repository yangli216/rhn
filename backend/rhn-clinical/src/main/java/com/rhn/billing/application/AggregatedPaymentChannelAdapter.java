package com.rhn.billing.application;

import com.rhn.billing.api.PaymentChannelAdapter;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.util.Set;

@Component
@ConditionalOnProperty(name = "rhn.billing.payment.aggregated-adapter.enabled", havingValue = "true")
public class AggregatedPaymentChannelAdapter implements PaymentChannelAdapter {
    private static final Set<String> SUPPORTED = Set.of("WECHAT", "ALIPAY");

    @Override public Set<String> paymentMethods() { return SUPPORTED; }
    @Override public com.rhn.billing.api.PaymentChannelCapabilities capabilities(String method) {
        return new com.rhn.billing.api.PaymentChannelCapabilities("AGGREGATED_SIMULATOR",
                com.rhn.billing.api.PaymentChannelCapabilities.PaymentInteraction.AUTHORIZATION_CODE,
                new com.rhn.billing.api.PaymentChannelCapabilities.PaymentAuthorizationCodeRule("[0-9]{16,24}", 16, 24), true, true, true);
    }

    @Override
    public InitiationResult initiate(PaymentInstruction instruction) {
        String method = instruction.paymentMethodCode();
        String orderNo = instruction.orderNo();

        if (instruction.terminalCode() != null && instruction.terminalCode().contains("DYNAMIC_QR")) {
            return InitiationResult.pending(method + "-QR-" + orderNo);
        }

        String externalOrderNo = method + "-EXT-" + orderNo;
        String transactionNo = method + "-TXN-" + System.currentTimeMillis() + "-" + orderNo;
        return InitiationResult.succeeded(externalOrderNo, transactionNo, instruction.amount());
    }

    @Override
    public RefundResult refund(RefundInstruction instruction) {
        String method = instruction.paymentMethodCode();
        String orderNo = instruction.orderNo();
        String externalOrderNo = method + "-RF-EXT-" + orderNo;
        String transactionNo = method + "-RF-TXN-" + System.currentTimeMillis() + "-" + orderNo;
        return RefundResult.succeeded(externalOrderNo, transactionNo, instruction.amount());
    }

    @Override
    public QueryResult query(QueryInstruction instruction) {
        String method = instruction.paymentMethodCode();
        String orderNo = instruction.orderNo();
        String extOrder = instruction.externalOrderNo() == null ? method + "-EXT-" + orderNo : instruction.externalOrderNo();
        String extTxn = method + "-TXN-" + System.currentTimeMillis() + "-" + orderNo;
        return QueryResult.succeeded(extOrder, extTxn, instruction.expectedAmount());
    }
}
