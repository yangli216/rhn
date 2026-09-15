package com.rhn.billing.api;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

/** Outbound fiscal receipt port; fiscal issuance is independent from settlement finalization. */
public interface FiscalReceiptAdapter {
    boolean supports(String fiscalAuthorityCode, String receiptType);

    ReceiptResult issue(ReceiptInstruction instruction);

    ReceiptResult query(String receiptRequestNo, String externalReceiptNo, String correlationId);

    ReceiptResult voidReceipt(ReceiptAction instruction);

    ReceiptResult redFlush(ReceiptAction instruction);

    record ReceiptInstruction(
            Long receiptId, Long settlementId, String receiptRequestNo, String idempotencyKey,
            String receiptType, String issueChannel, String fiscalAuthorityCode,
            String externalReceiptNo,
            String payerName, String payerIdentityDigest, BigDecimal amount, String currencyCode,
            BigDecimal insuranceAmount, BigDecimal personalAccountAmount, BigDecimal patientAmount,
            List<ReceiptLine> lines, String correlationId) {}

    record ReceiptLine(int lineNo, String categoryCode, String itemCode, String itemName,
                       BigDecimal quantity, BigDecimal amount) {}

    record ReceiptAction(Long receiptId, String receiptRequestNo, String idempotencyKey,
                         String externalReceiptNo, String reason, String correlationId) {}

    record ReceiptResult(
            Outcome outcome, String externalReceiptNo, String fiscalCode, String fiscalNumber,
            String verificationCode, String controlledObjectReference, Instant issuedAt,
            String errorCode, String errorMessage, Object sanitizedPayload) {
        public enum Outcome { ISSUED, PENDING, FAILED, VOIDED, RED_FLUSHED }
    }
}
