package com.rhn.billing.api;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/** Standardizes channel statements without leaking file formats into the billing domain. */
public interface ReconciliationAdapter {
    boolean supports(String sourceType, String sourceCode);

    ReconciliationStatement fetch(ReconciliationRequest request);

    record ReconciliationRequest(
            String sourceType, String sourceCode, Long organizationId, LocalDate businessDate,
            String currencyCode, String idempotencyKey, String correlationId) {}

    record ReconciliationStatement(
            String externalBatchNo, Instant generatedAt, List<ExternalTransaction> transactions,
            Object sanitizedMetadata) {}

    record ExternalTransaction(
            String externalTransactionNo, String externalOrderNo, String transactionType,
            String status, BigDecimal amount, String currencyCode, Instant occurredAt,
            String payerReferenceDigest, String memo) {}
}
