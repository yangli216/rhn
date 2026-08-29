package com.rhn.billing.api;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public final class BillingViews {
    private BillingViews() {}

    public record ChargeItemView(
            Long id, Long patientAccountId, Long residentId, Long encounterId, Long requestId,
            Long catalogItemId, String sourceType, Long sourceId, String requestCode, String status,
            BigDecimal quantity, String unitCode, BigDecimal unitPrice, BigDecimal totalAmount,
            String currencyCode, Long priceId, Long priceRevision, String priceType,
            String itemCode, String itemName, Instant occurredAt, Long enteredBy,
            Long reversesChargeItemId) {}

    public record InvoiceLineView(Long id, Long chargeItemId, int lineNo, BigDecimal amount) {}

    public record InvoiceView(
            Long id, Long patientAccountId, String invoiceNo, String invoiceType, String status,
            String currencyCode, BigDecimal grossAmount, BigDecimal discountAmount, BigDecimal netAmount,
            BigDecimal paidAmount, BigDecimal outstandingAmount, Instant issuedAt, Long issuedBy,
            List<InvoiceLineView> lines) {}

    public record PaymentView(
            Long id, Long patientAccountId, Long invoiceId, String paymentNo, String paymentType,
            String paymentMethodCode, String status, BigDecimal amount, String currencyCode,
            Instant paidAt, String externalTransactionNo, Long reversesPaymentId,
            Long enteredBy, String description) {}

    public record LedgerEntryView(
            Long id, Long patientAccountId, String entryType, String direction, BigDecimal amount,
            String currencyCode, Long chargeItemId, Long invoiceId, Long paymentId,
            Long reversesLedgerEntryId, Instant occurredAt, Instant recordedAt, Long recordedBy) {}

    public record AccountStatementView(
            Long accountId, long revision, Long residentId, Long encounterId, Long organizationId,
            Long departmentId, String accountType, String currencyCode, String status, Instant openedAt,
            BigDecimal chargeAmount, BigDecimal invoicedAmount, BigDecimal uninvoicedAmount,
            BigDecimal paymentAmount, BigDecimal refundAmount, BigDecimal accountBalance,
            List<ChargeItemView> charges, List<InvoiceView> invoices,
            List<PaymentView> payments, List<LedgerEntryView> ledgerEntries) {}

    public record ChargeSynchronizationView(
            int createdCharges, int existingCharges, AccountStatementView statement) {}

    public record BillingWorkItemView(
            Long encounterId, Long residentId, Long accountId, String currencyCode, String status,
            int sourceEventCount, int chargedEventCount, String latestSourceNo, Instant latestOccurredAt,
            BigDecimal chargeAmount, BigDecimal accountBalance) {}

    public record ReconciliationLineView(
            Long sourceId, String sourceType, String sourceNo, Long encounterId, Long accountId,
            Long chargeItemId, BigDecimal expectedQuantity, BigDecimal chargedQuantity,
            BigDecimal expectedAmount, BigDecimal chargedAmount, String status, String description) {}

    public record DailyReconciliationView(
            LocalDate businessDate, Long organizationId, String currencyCode,
            int sourceEventCount, int chargedEventCount, int discrepancyCount,
            BigDecimal chargeAmount, BigDecimal paymentAmount, BigDecimal refundAmount,
            BigDecimal ledgerDebit, BigDecimal ledgerCredit, BigDecimal ledgerBalance,
            List<ReconciliationLineView> lines) {}
}
