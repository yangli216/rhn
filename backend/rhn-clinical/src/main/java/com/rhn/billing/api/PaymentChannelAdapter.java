package com.rhn.billing.api;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * Outbound payment-channel port. Implementations own protocol signing, credentials, endpoint calls and
 * response verification. The billing core only consumes the normalized result.
 */
public interface PaymentChannelAdapter {
    boolean supports(String paymentMethodCode);

    InitiationResult initiate(PaymentInstruction instruction);

    RefundResult refund(RefundInstruction instruction);

    QueryResult query(QueryInstruction instruction);

    record PaymentInstruction(
            Long paymentOrderId, String orderNo, String idempotencyKey, Long patientAccountId,
            Long settlementId, String businessScene, String paymentSceneCode, String paymentMethodCode,
            BigDecimal amount, String currencyCode, String correlationId, String terminalCode,
            Instant expiresAt) {}

    record RefundInstruction(
            Long paymentOrderId, String orderNo, String idempotencyKey, Long originalPaymentId,
            String originalPaymentNo, String originalExternalTransactionNo, String businessScene,
            String paymentSceneCode, String paymentMethodCode, BigDecimal amount, String currencyCode,
            String reason, String correlationId, String terminalCode) {}

    record QueryInstruction(
            Long paymentOrderId, String orderNo, String orderType, String paymentMethodCode,
            String externalOrderNo, BigDecimal expectedAmount, String currencyCode,
            String correlationId, String terminalCode) {}

    record InitiationResult(
            Outcome outcome, String externalOrderNo, String externalTransactionNo,
            BigDecimal capturedAmount, String errorCode, String errorMessage) {
        public enum Outcome { SUCCEEDED, PENDING, FAILED }

        public static InitiationResult succeeded(String externalOrderNo, String transactionNo, BigDecimal amount) {
            return new InitiationResult(Outcome.SUCCEEDED, externalOrderNo, transactionNo, amount, null, null);
        }
        public static InitiationResult pending(String externalOrderNo) {
            return new InitiationResult(Outcome.PENDING, externalOrderNo, null, null, null, null);
        }
        public static InitiationResult failed(String externalOrderNo, String code, String message) {
            return new InitiationResult(Outcome.FAILED, externalOrderNo, null, null, code, message);
        }
    }

    record RefundResult(
            Outcome outcome, String externalOrderNo, String externalTransactionNo,
            BigDecimal refundedAmount, String errorCode, String errorMessage) {
        public enum Outcome { SUCCEEDED, PENDING, FAILED }

        public static RefundResult succeeded(String externalOrderNo, String transactionNo, BigDecimal amount) {
            return new RefundResult(Outcome.SUCCEEDED, externalOrderNo, transactionNo, amount, null, null);
        }
        public static RefundResult pending(String externalOrderNo) {
            return new RefundResult(Outcome.PENDING, externalOrderNo, null, null, null, null);
        }
        public static RefundResult failed(String externalOrderNo, String code, String message) {
            return new RefundResult(Outcome.FAILED, externalOrderNo, null, null, code, message);
        }
    }

    record QueryResult(
            Outcome outcome, String externalOrderNo, String externalTransactionNo,
            BigDecimal completedAmount, String errorCode, String errorMessage) {
        public enum Outcome { SUCCEEDED, PENDING, FAILED, CANCELLED, EXPIRED }

        public static QueryResult succeeded(String externalOrderNo, String transactionNo, BigDecimal amount) {
            return new QueryResult(Outcome.SUCCEEDED, externalOrderNo, transactionNo, amount, null, null);
        }
        public static QueryResult pending(String externalOrderNo) {
            return new QueryResult(Outcome.PENDING, externalOrderNo, null, null, null, null);
        }
        public static QueryResult failed(String externalOrderNo, String code, String message) {
            return new QueryResult(Outcome.FAILED, externalOrderNo, null, null, code, message);
        }
    }
}
