package com.rhn.billing.api;

import com.rhn.platform.dictionary.api.DictionaryBinding;
import com.rhn.platform.masterdata.api.MasterDataDictionaryCodes;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public final class BillingViews {
    private BillingViews() {}

    public record ChargeItemView(
            Long id, Long patientAccountId, Long residentId, Long encounterId, Long requestId,
            Long catalogItemId, @DictionaryBinding("BIL_CHARGE_SOURCE_TYPE") String sourceType, Long sourceId, String requestCode, String status,
            BigDecimal quantity, String unitCode, BigDecimal unitPrice, BigDecimal totalAmount,
            String currencyCode, Long priceId, Long priceRevision,
            @DictionaryBinding(MasterDataDictionaryCodes.PRICE_TYPE) String priceType,
            String itemCode, String itemName, Instant occurredAt, Long enteredBy,
            Long reversesChargeItemId, String packageSpec, String manufacturerName, String unitName,
            @DictionaryBinding(MasterDataDictionaryCodes.ACCOUNTING_CATEGORY) String accountingCategory,
            ChargeOrderingView ordering) {}

    public record ChargeOrderingView(Long departmentId, String departmentName, Long practitionerId,
                                     String doctorName, @DictionaryBinding(MasterDataDictionaryCodes.SERVICE_TYPE) String serviceType) {}

    public record InvoiceLineView(Long id, Long chargeItemId, int lineNo, BigDecimal amount) {}

    public record InvoiceView(
            Long id, Long patientAccountId, String invoiceNo, String commandCode, String invoiceType, String status,
            String currencyCode, BigDecimal grossAmount, BigDecimal discountAmount, BigDecimal netAmount,
            BigDecimal paidAmount, BigDecimal outstandingAmount, Instant issuedAt, Long issuedBy,
            List<InvoiceLineView> lines) {}

    public record SettlementLineView(
            Long id, Long chargeItemId, int lineNo, BigDecimal settledQuantity,
            BigDecimal grossAmount, BigDecimal discountAmount, BigDecimal insuranceAmount,
            BigDecimal patientAmount, BigDecimal otherAmount, BigDecimal netAmount) {}

    public record SettlementTenderView(
            Long id, Long paymentId, Long claimResponseId, int lineNo,
            @DictionaryBinding("BIL_TENDER_TYPE") String tenderType, String payerCode,
            String payerName, BigDecimal amount, String currencyCode) {}

    public record SettlementEventView(
            Long id, @DictionaryBinding("BIL_SETTLEMENT_EVENT_TYPE") String eventType, @DictionaryBinding("BIL_SETTLEMENT_STATUS") String statusFrom, @DictionaryBinding("BIL_SETTLEMENT_STATUS") String statusTo, String commandCode,
            Long actorId, String errorCode, String errorMessage, Instant occurredAt) {}

    /** 已取消的未付款结算单；insuranceNote 为撤销医保试算的结果说明，未试算医保时为空。 */
    public record CancelledSettlementView(Long settlementId, String settlementNo, BigDecimal netAmount,
                                          List<Long> chargeItemIds, String insuranceNote) {}

    public record SettlementView(
            Long id, long revision, Long patientAccountId, Long reversesSettlementId,
            Long legacyInvoiceId, String settlementNo, String commandCode,
            @DictionaryBinding("BIL_SETTLEMENT_TYPE") String settlementType,
            @DictionaryBinding("BIL_SETTLEMENT_SCENE") String settlementScene,
            @DictionaryBinding("PAY_USE_SCENE") String terminalScene, @DictionaryBinding("BIL_SETTLEMENT_STATUS") String status, BigDecimal grossAmount,
            BigDecimal discountAmount, BigDecimal insuranceAmount, BigDecimal patientAmount,
            BigDecimal otherAmount, BigDecimal reliefAmount, BigDecimal roundingAmount, BigDecimal netAmount,
            BigDecimal tenderedAmount, BigDecimal outstandingAmount, String currencyCode,
            String terminalCode, Long createdBy, Instant createdAt, Long finalizedBy, Instant finalizedAt,
            String errorCode, String errorMessage, List<SettlementLineView> lines,
            List<SettlementTenderView> tenders, List<SettlementEventView> events) {}

    /** One selectable operator of the settlement query: a current billing-position holder or someone who settled in the range. */
    public record SettlementCashierView(Long userId, String name, String username, boolean active, String positionName,
                                        List<String> terminalScenes) {}

    public record SettlementRecordView(
            Long id, Long patientAccountId, Long residentId, Long encounterId, Long departmentId,
            String residentName, String healthRecordNo,
            @DictionaryBinding("RESIDENT_GENDER") String gender,
            LocalDate birthDate,
            String encounterNo, String departmentName,
            String settlementNo, @DictionaryBinding("BIL_SETTLEMENT_TYPE") String settlementType,
            @DictionaryBinding("BIL_SETTLEMENT_SCENE") String settlementScene,
            @DictionaryBinding("PAY_USE_SCENE") String terminalScene,
            @DictionaryBinding("BIL_SETTLEMENT_STATUS") String status, BigDecimal grossAmount, BigDecimal discountAmount, BigDecimal insuranceAmount,
            BigDecimal patientAmount, BigDecimal otherAmount, BigDecimal roundingAmount, BigDecimal netAmount,
            String currencyCode, String terminalCode, Instant createdAt, Instant finalizedAt,
            Long finalizedBy, String cashierName, String cashierUsername) {}

    public record PaymentView(
            Long id, Long patientAccountId, Long invoiceId, Long paymentOrderId, String paymentNo, @DictionaryBinding("BIL_PAYMENT_TYPE") String paymentType,
            @DictionaryBinding("PAY_METHOD") String paymentMethodCode, @DictionaryBinding("PAY_USE_SCENE") String paymentSceneCode,
            String status, BigDecimal amount, String currencyCode,
            Instant paidAt, String externalTransactionNo, Long reversesPaymentId,
            Long enteredBy, String description) {}

    public record LedgerEntryView(
            Long id, Long patientAccountId, String entryType, String direction, BigDecimal amount,
            String currencyCode, Long chargeItemId, Long invoiceId, Long paymentId,
            Long claimResponseId, Long reversesLedgerEntryId, Instant occurredAt, Instant recordedAt, Long recordedBy) {}

    public record AccountStatementView(
            Long accountId, long revision, Long residentId, Long encounterId, Long organizationId,
            Long departmentId, String accountType, String currencyCode, String status, Instant openedAt,
            BigDecimal chargeAmount, BigDecimal invoicedAmount, BigDecimal uninvoicedAmount,
            BigDecimal paymentAmount, BigDecimal refundAmount, BigDecimal accountBalance,
            List<ChargeItemView> charges, List<InvoiceView> invoices,
            List<SettlementView> settlements, List<PaymentView> payments,
            List<LedgerEntryView> ledgerEntries) {}

    public record ChargeSynchronizationView(
            int createdCharges, int existingCharges, AccountStatementView statement) {}

    public record BillingWorkItemView(
            Long encounterId, Long residentId, String residentName, String healthRecordNo,
            @DictionaryBinding("RESIDENT_GENDER") String gender,
            LocalDate birthDate, String encounterNo,
            Long accountId, String currencyCode, @DictionaryBinding("BIL_WORK_STATUS") String status,
            int sourceEventCount, int chargedEventCount, String latestSourceNo, Instant latestOccurredAt,
            BigDecimal chargeAmount, BigDecimal accountBalance,
            String departmentName, Instant registeredAt) {}

    public record ReconciliationLineView(
            Long sourceId, @DictionaryBinding("BIL_CHARGE_SOURCE_TYPE") String sourceType, String sourceNo, Long encounterId, Long accountId,
            Long chargeItemId, BigDecimal expectedQuantity, BigDecimal chargedQuantity,
            BigDecimal expectedAmount, BigDecimal chargedAmount, @DictionaryBinding("BIL_RECONCILIATION_LINE_STATUS") String status, String description) {}

    public record DailyReconciliationView(
            LocalDate businessDate, Long organizationId, String currencyCode,
            int sourceEventCount, int chargedEventCount, int discrepancyCount,
            BigDecimal chargeAmount, BigDecimal paymentAmount, BigDecimal refundAmount,
            BigDecimal ledgerDebit, BigDecimal ledgerCredit, BigDecimal ledgerBalance,
            List<ReconciliationLineView> lines) {}
}
