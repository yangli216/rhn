package com.rhn.billing.application;

import com.rhn.billing.api.PaymentResultDirectory.PaymentOrderView;
import com.rhn.billing.api.RegistrationBillingViews.RegistrationIntentView;
import com.rhn.billing.api.RegistrationCancellationBillingDirectory;
import com.rhn.shared.api.BusinessException;
import org.springframework.stereotype.Service;

@Service
public class RegistrationCancellationBillingService implements RegistrationCancellationBillingDirectory {
    private static final java.util.List<String> FAILED_REFUND_STATUSES = java.util.List.of("FAILED", "CANCELLED", "EXPIRED");
    private static final int MAX_REFUND_ATTEMPTS = 20;
    private final RegistrationBillingIntentTransactionService transactions;
    private final PaymentOrchestrationService payments;
    private final InsuranceClaimApplicationService insuranceClaims;

    public RegistrationCancellationBillingService(RegistrationBillingIntentTransactionService transactions,
                                                   PaymentOrchestrationService payments,
                                                   InsuranceClaimApplicationService insuranceClaims) {
        this.transactions = transactions;
        this.payments = payments;
        this.insuranceClaims = insuranceClaims;
    }

    /**
     * 取消尚未收款的挂号意向。医保结算已成功（个人自付尚未收取）时，先冲正医保再释放号源，避免医保资金悬挂；
     * 冲正未确认成功则保留意向，用户可重试。
     */
    public RegistrationIntentView cancelIntent(Long intentId) {
        Long claimId = transactions.insuranceClaimToReverse(intentId);
        if (claimId != null) {
            var reversed = insuranceClaims.reverse(claimId, "REG-INTENT-CANCEL-" + intentId, "取消挂号");
            if (!"REVERSED".equals(reversed.status())) {
                throw com.rhn.shared.api.BusinessErrors.conflict("REGISTRATION_INSURANCE_REVERSAL_PENDING",
                        "医保冲正尚未确认成功，暂不能取消挂号，请稍后重试");
            }
        }
        return transactions.cancel(intentId);
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
        if (plan.insuranceClaimId() != null) {
            // 先冲正医保（外部调用不在持锁事务内）；冲正成功后再退个人自付部分。冲正按固定命令重试保持幂等。
            try {
                var reversed = insuranceClaims.reverse(plan.insuranceClaimId(),
                        insuranceReversalCommand(plan.insuranceClaimId(), encounterId, commandCode), reason);
                if (!"REVERSED".equals(reversed.status())) {
                    transactions.markCancellationFailed(plan.intentId(), "REGISTRATION_INSURANCE_REVERSAL_PENDING",
                            "医保冲正未确认完成");
                    return new CancellationBillingResult("CANCELLATION_FAILED", null, null, false,
                            "医保冲正尚未确认成功，请稍后重新发起退号");
                }
            } catch (BusinessException exception) {
                transactions.markCancellationFailed(plan.intentId(), exception.code(), exception.getMessage());
                throw exception;
            }
            if (plan.originalPaymentId() == null) {
                transactions.markCancellationCompleted(plan.intentId());
                return new CancellationBillingResult("CANCELLED", null, null, true, "医保结算已冲正，挂号费无需退款");
            }
        }
        PaymentOrderView refund;
        try {
            var refundCommand = refundCommand(plan, encounterId, commandCode, reason, terminalCode);
            refund = payments.refund(refundCommand);
        } catch (BusinessException exception) {
            transactions.markCancellationFailed(plan.intentId(), exception.code(), exception.getMessage());
            throw exception;
        }
        if ("REFUNDED".equals(refund.status())) {
            transactions.markCancellationCompleted(plan.intentId());
            return new CancellationBillingResult("CANCELLED", refund.id(), refund.status(), true,
                    "挂号费已原路退回");
        }
        if (FAILED_REFUND_STATUSES.contains(refund.status())) {
            transactions.markCancellationFailed(plan.intentId(),
                    refund.errorCode() == null ? "REGISTRATION_REFUND_FAILED" : refund.errorCode(),
                    refund.errorMessage() == null ? "挂号费退款失败" : refund.errorMessage());
            return new CancellationBillingResult("CANCELLATION_FAILED", refund.id(), refund.status(), false,
                    "退款未成功，请重新发起退号");
        }
        return new CancellationBillingResult("CANCELLATION_PENDING", refund.id(), refund.status(), false,
                "退款处理中，成功后再次确认即可完成退号");
    }

    /**
     * 同一退号指令码重试时，上一次退款已终态失败（FAILED/CANCELLED/EXPIRED）则换用新的尝试序号（-R{n}），
     * 避免固定指令码永远命中同一张失败订单；处理中或已成功的订单沿用原键，保持幂等。
     */
    private PaymentOrchestrationService.CreateRefundOrderCommand refundCommand(
            RegistrationBillingIntentTransactionService.CancellationPlan plan, Long encounterId, String commandCode, String reason, String terminalCode) {
        String baseKey = "REG-CANCEL-" + encounterId + "-" + commandCode;
        String key = baseKey;
        for (int attempt = 1; attempt <= MAX_REFUND_ATTEMPTS; attempt++) {
            var candidate = new PaymentOrchestrationService.CreateRefundOrderCommand(
                    plan.originalPaymentId(), key, plan.amount(), reason,
                    "REGISTRATION-CANCEL-" + encounterId, terminalCode);
            var existing = payments.findExistingRefund(candidate);
            if (existing.isEmpty() || !FAILED_REFUND_STATUSES.contains(existing.get().status())) return candidate;
            key = baseKey + "-R" + attempt;
        }
        throw com.rhn.shared.api.BusinessErrors.conflict("REGISTRATION_REFUND_ATTEMPTS_EXHAUSTED",
                "退款多次失败，请联系管理员处理后再退号");
    }

    /** 医保冲正失败后（FAILED/REVERSE）同一指令码已有失败回执，重试需换用按申请修订号区分的新指令码。 */
    private String insuranceReversalCommand(Long claimId, Long encounterId, String commandCode) {
        String base = "REG-CANCEL-INS-" + encounterId + "-" + commandCode;
        var claim = insuranceClaims.get(claimId);
        if (claim != null && "FAILED".equals(claim.status()) && "REVERSE".equals(claim.currentOperation())) {
            return base + "-R" + claim.revision();
        }
        return base;
    }
}
