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
        throw com.rhn.shared.api.BusinessErrors.conflict("CASH_RESULT_REQUIRES_RECONCILIATION",
                "现金没有外部查询回执，未确认指令须核对实际收退现金记录，不能按申请金额推定成功");
    }
}
