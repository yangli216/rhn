package com.rhn.billing.api;

import com.rhn.billing.api.PaymentResultDirectory.PaymentOrderView;
import com.rhn.billing.api.RefundPreCheckViews.DirectRefundCommand;
import com.rhn.billing.api.RefundPreCheckViews.RefundPaymentCandidateView;

import java.math.BigDecimal;
import java.util.List;

/**
 * Billing-owned refund boundary.
 *
 * Exposes only accounting facts and accounting-side refund execution. Cross-domain
 * eligibility decisions and downstream cancellations belong to coordination.
 */
public interface RefundBillingDirectory {
    RefundBillingSnapshot snapshotForEncounter(Long encounterId);

    RefundPaymentContext paymentContext(Long paymentId);

    PaymentOrderView executeDirectRefund(Long paymentId, DirectRefundCommand command);

    record RefundBillingSnapshot(
            Long encounterId,
            Long accountId,
            Long organizationId,
            boolean unexecutedDirectRefundAllowed,
            BigDecimal totalPaidAmount,
            String currencyCode,
            List<RefundChargeSnapshot> charges,
            List<RefundPaymentCandidateView> refundablePayments
    ) {
        public RefundBillingSnapshot {
            charges = List.copyOf(charges);
            refundablePayments = List.copyOf(refundablePayments);
        }

        public static RefundBillingSnapshot missingAccount(Long encounterId) {
            return new RefundBillingSnapshot(encounterId, null, null, false,
                    BigDecimal.ZERO, "CNY", List.of(), List.of());
        }
    }

    record RefundChargeSnapshot(
            Long chargeItemId,
            String sourceType,
            Long sourceId,
            String documentNo,
            String itemName,
            String itemCode,
            BigDecimal quantity,
            String unitCode,
            BigDecimal totalAmount,
            boolean reversed
    ) {
    }

    record RefundPaymentContext(Long paymentId, Long accountId, Long encounterId) {
    }
}
