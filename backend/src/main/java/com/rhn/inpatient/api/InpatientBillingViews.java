package com.rhn.inpatient.api;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public final class InpatientBillingViews {
    private InpatientBillingViews() {
    }

    public record CostLineView(
            String category, String sourceType, Long sourceId, String itemCode, String itemName,
            String status, BigDecimal quantity, String unitCode, BigDecimal unitPrice,
            BigDecimal totalAmount, String currencyCode, Instant occurredAt, boolean posted) {
    }

    public record AccountView(
            Long episodeId, Long encounterId, Long patientAccountId, String accountStatus,
            String clinicalStatus, String currencyCode, BigDecimal postedChargeAmount,
            BigDecimal estimatedOrderAmount, BigDecimal estimatedBedAmount, BigDecimal estimatedTotalAmount,
            BigDecimal depositAmount, BigDecimal ledgerBalance, BigDecimal estimatedOutstandingAmount,
            BigDecimal estimatedCreditAmount, boolean paymentDue, boolean financialWarningOnly,
            FinancialSettlementView financialSettlement, List<DepositRecordView> deposits,
            List<CostLineView> costLines) {
    }

    public record DepositRecordView(
            Long paymentId, String paymentNo, BigDecimal originalAmount, BigDecimal allocatedAmount,
            BigDecimal refundedAmount, BigDecimal availableAmount, String currencyCode,
            String paymentMethodCode, Instant paidAt, String externalTransactionNo, String description) {
    }

    public record DepositView(
            Long paymentId, String paymentNo, BigDecimal amount, String currencyCode,
            String paymentMethodCode, Instant paidAt, boolean duplicate, AccountView account) {
    }

    public record BedDayPostingView(
            Long episodeId, Long encounterId, LocalDate throughDate,
            int createdCount, int existingCount, BigDecimal postedAmount,
            AccountView account) {
    }

    public record CategorySummaryView(
            String category, String categoryName,
            BigDecimal postedAmount, BigDecimal estimatedAmount, BigDecimal amount) {
    }

    public record DailyStatementView(
            Long episodeId, Long encounterId, LocalDate businessDate,
            BigDecimal postedAmount, BigDecimal estimatedAmount,
            List<CategorySummaryView> categorySummaries,
            List<CostLineView> lines, Instant asOf) {
    }

    public record FinalSettlementView(
            Long episodeId, Long encounterId, Long invoiceId, Long settlementId,
            String invoiceNo, String settlementNo, String status,
            BigDecimal netAmount, BigDecimal prepaymentAmount, BigDecimal paidAmount,
            BigDecimal outstandingAmount, BigDecimal refundableAmount, String financialStatus,
            String currencyCode, boolean duplicate,
            AccountView account) {
    }

    public record FinancialSettlementView(
            Long invoiceId, Long settlementId, long revision, String invoiceNo, String settlementNo,
            String settlementStatus, String financialStatus, BigDecimal netAmount,
            BigDecimal prepaymentAmount, BigDecimal paidAmount, BigDecimal outstandingAmount,
            BigDecimal refundableAmount, String currencyCode, Instant finalizedAt) {
    }

    public record FinancialActionView(
            List<Long> paymentIds, boolean duplicate,
            FinancialSettlementView settlement, AccountView account) {
    }
}
