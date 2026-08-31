package com.rhn.billing.application;

import com.rhn.billing.api.PaymentResultDirectory.PaymentOrderView;
import com.rhn.billing.api.RegistrationCancellationBillingDirectory;
import com.rhn.shared.api.BusinessException;
import org.springframework.stereotype.Service;

@Service
public class RegistrationCancellationBillingService implements RegistrationCancellationBillingDirectory {
    private final RegistrationBillingIntentTransactionService transactions;
    private final PaymentOrchestrationService payments;

    public RegistrationCancellationBillingService(RegistrationBillingIntentTransactionService transactions,
                                                   PaymentOrchestrationService payments) {
        this.transactions = transactions;
        this.payments = payments;
    }

    @Override
    public CancellationBillingResult cancelBeforeService(Long encounterId, String commandCode,
                                                          String reason, String terminalCode) {
        var plan = transactions.prepareCancellation(encounterId);
        if (plan.readyToClose()) {
            boolean refunded = "CANCELLED".equals(plan.billingStatus()) && plan.amount().signum() > 0;
            return new CancellationBillingResult(plan.billingStatus(), null, refunded ? "REFUNDED" : null, true,
                    plan.intentId() == null ? "本次挂号无收费意向"
                            : refunded ? "挂号费已退款，退号已完成" : "挂号费无需退款");
        }
        String refundKey = "REG-CANCEL-" + encounterId + "-" + commandCode;
        PaymentOrderView refund;
        try {
            refund = payments.refund(new PaymentOrchestrationService.CreateRefundOrderCommand(
                    plan.originalPaymentId(), refundKey, plan.amount(), reason,
                    "REGISTRATION-CANCEL-" + encounterId, terminalCode));
        } catch (BusinessException exception) {
            transactions.markCancellationFailed(plan.intentId(), exception.code(), exception.getMessage());
            throw exception;
        }
        if ("REFUNDED".equals(refund.status())) {
            transactions.markCancellationCompleted(plan.intentId());
            return new CancellationBillingResult("CANCELLED", refund.id(), refund.status(), true,
                    "挂号费已原路退回");
        }
        if (java.util.List.of("FAILED", "CANCELLED", "EXPIRED").contains(refund.status())) {
            transactions.markCancellationFailed(plan.intentId(),
                    refund.errorCode() == null ? "REGISTRATION_REFUND_FAILED" : refund.errorCode(),
                    refund.errorMessage() == null ? "挂号费退款失败" : refund.errorMessage());
            return new CancellationBillingResult("CANCELLATION_FAILED", refund.id(), refund.status(), false,
                    "退款未成功，请重新发起退号");
        }
        return new CancellationBillingResult("CANCELLATION_PENDING", refund.id(), refund.status(), false,
                "退款处理中，成功后再次确认即可完成退号");
    }
}
