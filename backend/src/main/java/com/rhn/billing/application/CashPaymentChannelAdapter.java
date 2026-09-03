package com.rhn.billing.application;

import com.rhn.billing.api.PaymentChannelAdapter;
import org.springframework.stereotype.Component;

@Component
class CashPaymentChannelAdapter implements PaymentChannelAdapter {
    @Override
    public boolean supports(String paymentMethodCode) {
        return "CASH".equals(paymentMethodCode);
    }

    @Override
    public InitiationResult initiate(PaymentInstruction instruction) {
        return InitiationResult.succeeded(
                instruction.paymentMethodCode() + "-" + instruction.orderNo(),
                instruction.paymentMethodCode() + "-" + instruction.orderNo(),
                instruction.amount());
    }

    @Override
    public RefundResult refund(RefundInstruction instruction) {
        return RefundResult.succeeded(
                instruction.paymentMethodCode() + "-RF-" + instruction.orderNo(),
                instruction.paymentMethodCode() + "-RF-" + instruction.orderNo(),
                instruction.amount());
    }

    @Override
    public QueryResult query(QueryInstruction instruction) {
        return QueryResult.succeeded(
                instruction.externalOrderNo() == null ? instruction.paymentMethodCode() + "-" + instruction.orderNo() : instruction.externalOrderNo(),
                instruction.paymentMethodCode() + "-" + instruction.orderNo(), instruction.expectedAmount());
    }
}
