package com.rhn.billing.api;

import java.math.BigDecimal;

/**
 * Inbound boundary called by a channel adapter only after protocol authentication and signature verification.
 */
public interface PaymentResultDirectory {
    PaymentOrderView accept(VerifiedPaymentResult result);

    record VerifiedPaymentResult(
            String paymentMethodCode, String externalMessageBusinessId, String commandCode,
            String paymentOrderNo, String externalOrderNo, String externalTransactionNo,
            ResultStatus status, BigDecimal capturedAmount, String errorCode, String errorMessage,
            Object sanitizedPayload) {
        public enum ResultStatus { SUCCEEDED, PENDING, FAILED }
    }

    record PaymentOrderView(
            Long id, long revision, Long patientAccountId, Long settlementId, Long originalPaymentId, String orderNo,
            String idempotencyKey, String businessScene, String paymentSceneCode,
            String paymentMethodCode, String paymentMethodName, String orderType, String status,
            BigDecimal requestedAmount, BigDecimal capturedAmount, BigDecimal refundedAmount,
            String currencyCode, String externalOrderNo, String correlationId, String terminalCode,
            java.time.Instant expiresAt, java.time.Instant createdAt, java.time.Instant updatedAt,
            String errorCode, String errorMessage, boolean duplicate,
            java.util.List<PaymentEventView> events) {}

    record PaymentEventView(
            Long id, Long externalMessageId, String eventType, String statusFrom, String statusTo,
            String commandCode, String externalTransactionNo, BigDecimal eventAmount,
            String errorCode, String errorMessage, java.time.Instant occurredAt) {}
}
