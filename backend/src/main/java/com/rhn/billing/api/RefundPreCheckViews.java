package com.rhn.billing.api;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

/**
 * 门诊退费防损与协同检查模型定义。
 */
public final class RefundPreCheckViews {
    private RefundPreCheckViews() {}

    public record RefundPreCheckSummaryView(
            Long encounterId,
            Long accountId,
            boolean eligibleForRefund,
            String overallDecision,
            String summaryNotice,
            BigDecimal totalPaidAmount,
            BigDecimal refundableAmount,
            String currencyCode,
            List<RefundItemPreCheckView> items,
            List<RefundPaymentCandidateView> refundablePayments
    ) {}

    public record RefundItemPreCheckView(
            Long chargeItemId,
            String sourceType,
            Long sourceId,
            String documentNo,
            String itemName,
            String itemCode,
            BigDecimal quantity,
            String unitCode,
            BigDecimal totalAmount,
            String executionStatusCode,
            String executionStatusName,
            boolean allowed,
            String statusBadgeText,
            String statusTone,
            String blockReason
    ) {}

    public record RefundPaymentCandidateView(
            Long paymentId,
            String paymentNo,
            String paymentMethodCode,
            BigDecimal amount,
            BigDecimal refundedAmount,
            BigDecimal refundableAmount,
            String currencyCode,
            Instant paidAt
    ) {}

    public record DirectRefundCommand(
            String idempotencyKey,
            BigDecimal amount,
            String reason,
            String terminalCode,
            List<Long> chargeItemIds
    ) {}
}
