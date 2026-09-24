package com.rhn.billing.api;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

/** Billing-owned boundary used by the inpatient module. */
public interface InpatientBillingDirectory {
    AccountSnapshot account(Long tenantId, Long encounterId, String currencyCode);

    DepositResult registerDeposit(DepositCommand command);

    void postExecutedOrderTask(ExecutedOrderChargeCommand command);

    void postBedDay(BedDayChargeCommand command);

    FinalSettlementResult issueFinalSettlement(FinalSettlementCommand command);

    SettlementPaymentResult collectFinalPayment(SettlementPaymentCommand command);

    SurplusRefundResult refundSurplus(SurplusRefundCommand command);

    record PostedCharge(
            Long id, Long requestId, String sourceType, Long sourceId, String requestCode, String status,
            Long catalogItemId, String itemCode, String itemName, BigDecimal quantity, String unitCode,
            BigDecimal unitPrice, BigDecimal totalAmount, String currencyCode, Instant occurredAt,
            String accountingCategory) {

        public PostedCharge(
                Long id, Long requestId, String sourceType, Long sourceId, String requestCode, String status,
                Long catalogItemId, String itemCode, String itemName, BigDecimal quantity, String unitCode,
                BigDecimal unitPrice, BigDecimal totalAmount, String currencyCode, Instant occurredAt) {
            this(id, requestId, sourceType, sourceId, requestCode, status, catalogItemId, itemCode, itemName,
                    quantity, unitCode, unitPrice, totalAmount, currencyCode, occurredAt, null);
        }
    }

    record AccountSnapshot(
            Long patientAccountId, String accountStatus, BigDecimal depositAmount,
            BigDecimal ledgerBalance, FinancialSettlementSnapshot financialSettlement,
            List<DepositSnapshot> deposits, List<PostedCharge> charges) {
        public AccountSnapshot {
            deposits = List.copyOf(deposits);
            charges = List.copyOf(charges);
        }

        public static AccountSnapshot unopened() {
            return new AccountSnapshot(null, "NOT_OPENED", BigDecimal.ZERO, BigDecimal.ZERO, null,
                    List.of(), List.of());
        }
    }

    record DepositSnapshot(
            Long paymentId, String paymentNo, BigDecimal originalAmount, BigDecimal allocatedAmount,
            BigDecimal refundedAmount, BigDecimal availableAmount, String currencyCode,
            String paymentMethodCode, Instant paidAt, String externalTransactionNo, String description) {
    }

    record FinancialSettlementSnapshot(
            Long invoiceId, Long settlementId, long revision, String invoiceNo, String settlementNo,
            String settlementStatus, String financialStatus, BigDecimal netAmount,
            BigDecimal prepaymentAmount, BigDecimal paidAmount, BigDecimal outstandingAmount,
            BigDecimal refundableAmount, String currencyCode, Instant finalizedAt) {
    }

    record DepositCommand(
            Long tenantId, Long residentId, Long encounterId, Long organizationId, Long departmentId,
            String paymentNo, BigDecimal amount, String currencyCode, String paymentMethodCode,
            Instant paidAt, String externalTransactionNo, String description, Long actorId) {
    }

    record DepositResult(
            Long paymentId, String paymentNo, BigDecimal amount, String currencyCode,
            String paymentMethodCode, Instant paidAt, boolean duplicate) {
    }

    record ExecutedOrderChargeCommand(
            Long tenantId, Long residentId, Long encounterId, Long organizationId, Long departmentId,
            Long requestId, Long taskId, int occurrenceNo, String requestNo, Long catalogItemId,
            String itemCode, String itemName, String unitCode, BigDecimal unitPrice, BigDecimal totalAmount,
            String currencyCode, Long priceId, Long priceRevision, String priceType,
            Instant completedAt, Long completedBy, String accountingCategory) {

        public ExecutedOrderChargeCommand(
                Long tenantId, Long residentId, Long encounterId, Long organizationId, Long departmentId,
                Long requestId, Long taskId, int occurrenceNo, String requestNo, Long catalogItemId,
                String itemCode, String itemName, String unitCode, BigDecimal unitPrice, BigDecimal totalAmount,
                String currencyCode, Long priceId, Long priceRevision, String priceType,
                Instant completedAt, Long completedBy) {
            this(tenantId, residentId, encounterId, organizationId, departmentId, requestId, taskId, occurrenceNo,
                    requestNo, catalogItemId, itemCode, itemName, unitCode, unitPrice, totalAmount,
                    currencyCode, priceId, priceRevision, priceType, completedAt, completedBy, null);
        }
    }

    record BedDayChargeCommand(
            Long tenantId, Long residentId, Long encounterId, Long organizationId, Long departmentId,
            Long bedDayFactId, Long catalogItemId, String itemCode, String itemName,
            BigDecimal unitPrice, String currencyCode, Long priceId, Long priceRevision,
            String priceType, Instant occurredAt, Long actorId) {
    }

    record FinalSettlementCommand(Long tenantId, Long patientAccountId, String invoiceNo,
                                  Instant issuedAt, String terminalCode) {
    }

    record FinalSettlementResult(
            Long invoiceId, Long settlementId, String invoiceNo, String settlementNo,
            String status, BigDecimal netAmount, BigDecimal prepaymentAmount,
            BigDecimal paidAmount, BigDecimal outstandingAmount, BigDecimal refundableAmount,
            String financialStatus, String currencyCode, boolean duplicate) {
    }

    record SettlementPaymentCommand(
            Long tenantId, Long settlementId, long expectedRevision, String commandCode,
            String paymentMethodCode, BigDecimal amount, Instant paidAt,
            String externalTransactionNo, String description) {
    }

    record SettlementPaymentResult(
            Long paymentId, boolean duplicate, FinancialSettlementSnapshot settlement) {
    }

    record SurplusRefundCommand(
            Long tenantId, Long settlementId, long expectedRevision, String commandCode,
            BigDecimal amount, Instant refundedAt, String externalTransactionNo, String reason) {
    }

    record SurplusRefundResult(
            List<Long> refundPaymentIds, boolean duplicate, FinancialSettlementSnapshot settlement) {
        public SurplusRefundResult {
            refundPaymentIds = List.copyOf(refundPaymentIds);
        }
    }
}
