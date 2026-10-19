package com.rhn.billing.api;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/** Standardizes channel statements without leaking file formats into the billing domain. */
public interface ReconciliationAdapter {
    default boolean supports(String sourceType, String sourceCode) { return false; }

    default ReconciliationStatement fetch(ReconciliationRequest request) { throw new UnsupportedOperationException("Legacy reconciliation is not supported"); }

    default PaymentReconciliation.StatementCapability statementCapability() { return null; }
    default PaymentReconciliation.MerchantScope merchantScope(Long tenantId, Long organizationId) { throw new UnsupportedOperationException(); }
    default PaymentReconciliation.StatementDownload download(PaymentReconciliation.StatementRequest request) { throw new UnsupportedOperationException(); }
    default PaymentReconciliation.ParsedStatement parse(PaymentReconciliation.StatementRequest request,
            PaymentReconciliation.StatementDownload download) { throw new UnsupportedOperationException(); }

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
