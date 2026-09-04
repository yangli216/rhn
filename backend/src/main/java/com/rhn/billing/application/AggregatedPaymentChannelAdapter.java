package com.rhn.billing.application;

import com.rhn.billing.api.PaymentChannelAdapter;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.util.Set;

@Component
@ConditionalOnProperty(name = "rhn.billing.payment.aggregated-adapter.enabled", havingValue = "true", matchIfMissing = true)
public class AggregatedPaymentChannelAdapter implements PaymentChannelAdapter {
    private static final Set<String> SUPPORTED = Set.of("WECHAT", "ALIPAY");

    @Override
    public boolean supports(String paymentMethodCode) {
        return paymentMethodCode != null && SUPPORTED.contains(paymentMethodCode.trim().toUpperCase());
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
