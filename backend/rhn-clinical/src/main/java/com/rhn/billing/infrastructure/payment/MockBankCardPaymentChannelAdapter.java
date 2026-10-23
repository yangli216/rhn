package com.rhn.billing.infrastructure.payment;

import com.rhn.billing.api.PaymentChannelAdapter;
import com.rhn.billing.api.PaymentChannelCapabilities;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * 本地联调用的银行卡（POS 刷卡）模拟渠道：指令直接成功，没有外部回执可查。
 * 仅在 {@code rhn.billing.payment.bank-card.mock-enabled=true}（payment-mock profile）时注册，正式环境不得开启。
 */
@Component
@ConditionalOnProperty(name = "rhn.billing.payment.bank-card.mock-enabled", havingValue = "true")
class MockBankCardPaymentChannelAdapter implements PaymentChannelAdapter {
    @Override public java.util.Set<String> paymentMethods() { return java.util.Set.of("BANK_CARD"); }

    @Override public PaymentChannelCapabilities capabilities(String method) {
        return new PaymentChannelCapabilities("BANK_CARD_MOCK", PaymentChannelCapabilities.PaymentInteraction.DIRECT,
                null, false, true, false);
    }

    @Override public InitiationResult initiate(PaymentInstruction instruction) {
        String no = "MOCK-BANK-" + instruction.orderNo();
        return InitiationResult.succeeded(no, no, instruction.amount());
    }

    @Override public RefundResult refund(RefundInstruction instruction) {
        String no = "MOCK-BANK-RF-" + instruction.orderNo();
        return RefundResult.succeeded(no, no, instruction.amount());
    }

    @Override public QueryResult query(QueryInstruction instruction) {
        throw com.rhn.shared.api.BusinessErrors.conflict("BANK_CARD_MOCK_RESULT_UNQUERYABLE",
                "模拟银行卡渠道没有外部查询回执，未确认指令须核对实际刷卡记录");
    }
}
