package com.rhn.billing.application;

import com.rhn.billing.api.BillingViews.SettlementEventView;
import com.rhn.billing.api.BillingViews.SettlementLineView;
import com.rhn.billing.api.BillingViews.SettlementTenderView;
import com.rhn.billing.api.BillingViews.SettlementView;
import com.rhn.billing.domain.ChargeItem;
import com.rhn.billing.domain.Invoice;
import com.rhn.billing.domain.InvoiceLine;
import com.rhn.billing.domain.LedgerEntry;
import com.rhn.billing.domain.PatientAccount;
import com.rhn.billing.domain.Payment;
import com.rhn.billing.domain.Settlement;
import com.rhn.billing.domain.SettlementCategorySummary;
import com.rhn.billing.domain.SettlementEvent;
import com.rhn.billing.domain.SettlementLine;
import com.rhn.billing.domain.SettlementTender;
import com.rhn.billing.infrastructure.PatientAccountRepository;
import com.rhn.billing.infrastructure.LedgerEntryRepository;
import com.rhn.billing.infrastructure.SettlementCategorySummaryRepository;
import com.rhn.billing.infrastructure.SettlementEventRepository;
import com.rhn.billing.infrastructure.SettlementLineRepository;
import com.rhn.billing.infrastructure.SettlementRepository;
import com.rhn.billing.infrastructure.SettlementTenderRepository;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import static com.rhn.shared.api.BusinessErrors.forbidden;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class SettlementApplicationService {
    private final SettlementRepository settlements;
    private final SettlementLineRepository lines;
    private final SettlementTenderRepository tenders;
    private final SettlementEventRepository events;
    private final SettlementCategorySummaryRepository categories;
    private final PatientAccountRepository accounts;
    private final LedgerEntryRepository ledger;
    private final ExecutionContextProvider contextProvider;

    public SettlementApplicationService(SettlementRepository settlements, SettlementLineRepository lines,
                                        SettlementTenderRepository tenders, SettlementEventRepository events,
                                        SettlementCategorySummaryRepository categories,
                                        PatientAccountRepository accounts, LedgerEntryRepository ledger,
                                        ExecutionContextProvider contextProvider) {
        this.settlements = settlements; this.lines = lines; this.tenders = tenders; this.events = events;
        this.categories = categories; this.accounts = accounts; this.ledger = ledger; this.contextProvider = contextProvider;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    Settlement createFromInvoice(ExecutionContext context, PatientAccount account, Invoice invoice,
                                 List<ChargeItem> chargeItems, List<InvoiceLine> invoiceLines,
                                 String settlementScene, String terminalScene, String terminalCode,
                                 String categoryCode, String categoryName) {
        Settlement existing = settlements.findByTenantIdAndLegacyInvoiceId(context.tenantId(), invoice.id()).orElse(null);
        if (existing != null) return existing;
        String type = "CREDIT".equals(invoice.invoiceType()) ? "REVERSAL" : "NORMAL";
        Settlement value = settlements.save(new Settlement(invoice.id(), context.tenantId(), account.id(), invoice.id(),
                invoice.invoiceNo(), "SETTLE-" + invoice.invoiceNo(), type,
                scene(settlementScene, "OUTPATIENT"), terminal(terminalScene, "CASHIER"),
                invoice.netAmount(), invoice.currencyCode(), clean(terminalCode), context.subjectId(), invoice.issuedAt()));
        Map<Long, ChargeItem> byId = chargeItems.stream().collect(java.util.stream.Collectors.toMap(ChargeItem::id, item -> item));
        for (InvoiceLine line : invoiceLines) {
            ChargeItem charge = byId.get(line.chargeItemId());
            lines.save(new SettlementLine(context.tenantId(), value.id(), line.chargeItemId(), line.id(),
                    line.lineNo(), charge.quantity(), line.amount()));
        }
        categories.save(new SettlementCategorySummary(context.tenantId(), value.id(), categoryCode,
                categoryName, invoice.netAmount(), invoice.issuedAt()));
        events.save(new SettlementEvent(context.tenantId(), value.id(), "CREATE", null, value.status(),
                "CREATE-" + invoice.invoiceNo(), context.subjectId(), invoice.issuedAt()));
        return value;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    void recordPayment(ExecutionContext context, Invoice invoice, Payment payment, BigDecimal paidAmount) {
        if (!"PAYMENT".equals(payment.paymentType())) return;
        Settlement value = settlements.lockByIdAndTenantId(invoice.id(), context.tenantId())
                .orElseThrow(() -> notFound("SETTLEMENT_NOT_FOUND", "未找到正式结算单"));
        if (tenders.findByTenantIdAndPaymentId(context.tenantId(), payment.id()).isPresent()) return;
        int lineNo = Math.toIntExact(tenders.countByTenantIdAndSettlementId(context.tenantId(), value.id()) + 1);
        tenders.save(new SettlementTender(context.tenantId(), value.id(), payment.id(), lineNo,
                tenderType(payment.paymentMethodCode()), payment.paymentMethodCode(), payment.paymentMethodCode(),
                payment.amount(), payment.currencyCode()));
        String previous = value.applyPaidAmount(money(tenders.totalTendered(context.tenantId(), value.id())),
                context.subjectId(), payment.paidAt());
        String eventType = "SETTLED".equals(value.status()) ? "FINALIZE" : "PARTIAL_PAY";
        events.save(new SettlementEvent(context.tenantId(), value.id(), eventType, previous, value.status(),
                "PAYMENT-" + payment.id(), context.subjectId(), payment.paidAt()));
    }

    @Transactional(propagation = Propagation.MANDATORY)
    void recordInsuranceResponse(ExecutionContext context, Long settlementId, Long claimResponseId,
                                 String payerCode, String payerName, BigDecimal insuranceFund,
                                 BigDecimal personalAccount, BigDecimal patientCash, BigDecimal otherFund,
                                 Instant occurredAt) {
        Settlement value = settlements.lockByIdAndTenantId(settlementId, context.tenantId())
                .orElseThrow(() -> notFound("SETTLEMENT_NOT_FOUND", "未找到正式结算单"));
        if (tenders.existsByTenantIdAndClaimResponseId(context.tenantId(), claimResponseId)) return;
        try { value.applyInsuranceAllocation(insuranceFund, personalAccount, patientCash, otherFund); }
        catch (IllegalStateException exception) {
            throw com.rhn.shared.api.BusinessErrors.conflict("SETTLEMENT_INSURANCE_ALLOCATION_INVALID", exception.getMessage());
        }
        List<SettlementLine> values = lines.findByTenantIdAndSettlementIdOrderByLineNoAsc(context.tenantId(), settlementId);
        allocateLines(values, value.netAmount(), insuranceFund, otherFund);
        int lineNo = Math.toIntExact(tenders.countByTenantIdAndSettlementId(context.tenantId(), settlementId) + 1);
        if (insuranceFund.signum() > 0) tenders.save(new SettlementTender(context.tenantId(), settlementId,
                claimResponseId, lineNo++, "INSURANCE_FUND", payerCode, payerName, insuranceFund,
                value.currencyCode(), true));
        if (personalAccount.signum() > 0) tenders.save(new SettlementTender(context.tenantId(), settlementId,
                claimResponseId, lineNo++, "PERSONAL_ACCOUNT", payerCode, payerName, personalAccount,
                value.currencyCode(), true));
        if (otherFund.signum() > 0) tenders.save(new SettlementTender(context.tenantId(), settlementId,
                claimResponseId, lineNo, "SUBSIDY", payerCode, payerName, otherFund,
                value.currencyCode(), true));
        recordInsuranceLedger(context, value, claimResponseId, "INSURANCE_FUND", insuranceFund, occurredAt);
        recordInsuranceLedger(context, value, claimResponseId, "PERSONAL_ACCOUNT", personalAccount, occurredAt);
        recordInsuranceLedger(context, value, claimResponseId, "OTHER_FUND", otherFund, occurredAt);
        BigDecimal funded = money(tenders.totalTendered(context.tenantId(), settlementId));
        String previous = value.applyPaidAmount(funded, context.subjectId(), occurredAt);
        events.save(new SettlementEvent(context.tenantId(), settlementId,
                "SETTLED".equals(value.status()) ? "FINALIZE" : "PARTIAL_PAY", previous, value.status(),
                "INSURANCE-" + claimResponseId, context.subjectId(), occurredAt));
    }

    @Transactional(propagation = Propagation.MANDATORY)
    void recordInsuranceReversal(ExecutionContext context, Long settlementId, Long originalClaimResponseId,
                                 Long reversalClaimResponseId, String payerCode, String payerName,
                                 BigDecimal insuranceFund, BigDecimal personalAccount, BigDecimal otherFund,
                                 Instant occurredAt) {
        Settlement value = settlements.lockByIdAndTenantId(settlementId, context.tenantId())
                .orElseThrow(() -> notFound("SETTLEMENT_NOT_FOUND", "未找到正式结算单"));
        if (tenders.existsByTenantIdAndClaimResponseId(context.tenantId(), reversalClaimResponseId)) return;
        try { value.reverseInsuranceAllocation(); }
        catch (IllegalStateException exception) {
            throw com.rhn.shared.api.BusinessErrors.conflict(
                    "SETTLEMENT_INSURANCE_REVERSAL_INVALID", exception.getMessage());
        }
        List<SettlementLine> values = lines.findByTenantIdAndSettlementIdOrderByLineNoAsc(
                context.tenantId(), settlementId);
        allocateLines(values, value.netAmount(), BigDecimal.ZERO.setScale(6), BigDecimal.ZERO.setScale(6));
        int lineNo = Math.toIntExact(tenders.countByTenantIdAndSettlementId(context.tenantId(), settlementId) + 1);
        if (insuranceFund.signum() > 0) tenders.save(new SettlementTender(context.tenantId(), settlementId,
                reversalClaimResponseId, lineNo++, "INSURANCE_FUND", payerCode, payerName,
                insuranceFund.negate(), value.currencyCode(), true));
        if (personalAccount.signum() > 0) tenders.save(new SettlementTender(context.tenantId(), settlementId,
                reversalClaimResponseId, lineNo++, "PERSONAL_ACCOUNT", payerCode, payerName,
                personalAccount.negate(), value.currencyCode(), true));
        if (otherFund.signum() > 0) tenders.save(new SettlementTender(context.tenantId(), settlementId,
                reversalClaimResponseId, lineNo, "SUBSIDY", payerCode, payerName,
                otherFund.negate(), value.currencyCode(), true));
        recordInsuranceLedgerReversal(context, value, originalClaimResponseId, reversalClaimResponseId,
                "INSURANCE_FUND", insuranceFund, occurredAt);
        recordInsuranceLedgerReversal(context, value, originalClaimResponseId, reversalClaimResponseId,
                "PERSONAL_ACCOUNT", personalAccount, occurredAt);
        recordInsuranceLedgerReversal(context, value, originalClaimResponseId, reversalClaimResponseId,
                "OTHER_FUND", otherFund, occurredAt);
        BigDecimal funded = money(tenders.totalTendered(context.tenantId(), settlementId));
        String previous = value.applyPaidAmount(funded, context.subjectId(), occurredAt);
        events.save(new SettlementEvent(context.tenantId(), settlementId, "REVERSE_COMPLETE", previous,
                value.status(), "INSURANCE-REVERSE-" + reversalClaimResponseId,
                context.subjectId(), occurredAt));
    }

    @Transactional(propagation = Propagation.MANDATORY)
    void recordPaymentRequested(ExecutionContext context, Long settlementId, Long paymentOrderId) {
        Settlement value = settlements.lockByIdAndTenantId(settlementId, context.tenantId())
                .orElseThrow(() -> notFound("SETTLEMENT_NOT_FOUND", "未找到正式结算单"));
        String command = "PAYMENT-REQUEST-" + paymentOrderId;
        if (events.findByTenantIdAndSettlementIdAndCommandCode(context.tenantId(), settlementId, command).isPresent()) return;
        String previous = value.requestPayment();
        events.save(new SettlementEvent(context.tenantId(), settlementId, "REQUEST_PAYMENT", previous,
                value.status(), command, context.subjectId(), Instant.now()));
    }

    @Transactional(readOnly = true)
    public SettlementView get(Long settlementId) {
        ExecutionContext context = contextProvider.requireCurrent();
        Settlement value = settlements.findByIdAndTenantId(settlementId, context.tenantId())
                .orElseThrow(() -> notFound("SETTLEMENT_NOT_FOUND", "未找到正式结算单"));
        PatientAccount account = accounts.findByIdAndTenantId(value.patientAccountId(), context.tenantId())
                .orElseThrow(() -> notFound("PATIENT_ACCOUNT_NOT_FOUND", "未找到患者费用账户"));
        if (!context.hasWorkContext() || !context.canAccessOrganization(account.organizationId())
                || !context.canAccessDepartment(account.departmentId())) {
            throw forbidden("SETTLEMENT_FORBIDDEN", "当前工作上下文不能访问该结算单");
        }
        return view(context, value);
    }

    Settlement requireForPayment(ExecutionContext context, Long settlementId) {
        Settlement value = settlements.findByIdAndTenantId(settlementId, context.tenantId())
                .orElseThrow(() -> notFound("SETTLEMENT_NOT_FOUND", "未找到正式结算单"));
        if (!List.of("PRICED", "PAYMENT_PENDING", "PARTIAL").contains(value.status())) {
            throw com.rhn.shared.api.BusinessErrors.conflict("SETTLEMENT_NOT_PAYABLE", "当前结算单状态不允许发起支付");
        }
        return value;
    }

    BigDecimal nonPaymentTendered(ExecutionContext context, Long settlementId) {
        return money(tenders.nonPaymentTendered(context.tenantId(), settlementId));
    }

    List<SettlementView> listByAccount(ExecutionContext context, Long accountId) {
        return settlements.findByTenantIdAndPatientAccountIdOrderByCreatedAtAscIdAsc(context.tenantId(), accountId)
                .stream().map(value -> view(context, value)).toList();
    }

    private SettlementView view(ExecutionContext context, Settlement value) {
        List<SettlementLineView> lineViews = lines.findByTenantIdAndSettlementIdOrderByLineNoAsc(context.tenantId(), value.id())
                .stream().map(line -> new SettlementLineView(line.id(), line.chargeItemId(), line.lineNo(),
                        line.settledQuantity(), line.grossAmount(), line.discountAmount(), line.insuranceAmount(),
                        line.patientAmount(), line.otherAmount(), line.netAmount())).toList();
        List<SettlementTenderView> tenderViews = tenders.findByTenantIdAndSettlementIdOrderByLineNoAsc(context.tenantId(), value.id())
                .stream().map(tender -> new SettlementTenderView(tender.id(), tender.paymentId(), tender.claimResponseId(),
                        tender.lineNo(), tender.tenderType(), tender.payerCode(), tender.payerNameSnapshot(), tender.tenderAmount(),
                        tender.currencyCode())).toList();
        List<SettlementEventView> eventViews = events.findByTenantIdAndSettlementIdOrderByIdAsc(context.tenantId(), value.id())
                .stream().map(event -> new SettlementEventView(event.id(), event.eventType(), event.statusFrom(),
                        event.statusTo(), event.commandCode(), event.actorId(), event.errorCode(), event.errorMessage(),
                        event.occurredAt())).toList();
        BigDecimal tendered = money(tenderViews.stream().map(SettlementTenderView::amount)
                .reduce(BigDecimal.ZERO, BigDecimal::add));
        return new SettlementView(value.id(), value.revision(), value.patientAccountId(), value.reversesSettlementId(),
                value.legacyInvoiceId(), value.settlementNo(), value.commandCode(), value.settlementType(),
                value.settlementScene(), value.terminalScene(), value.status(), value.grossAmount(),
                value.discountAmount(), value.insuranceAmount(), value.patientAmount(), value.otherAmount(),
                value.roundingAmount(), value.netAmount(), tendered, money(value.netAmount().subtract(tendered)),
                value.currencyCode(), value.terminalCode(), value.createdBy(), value.createdAt(),
                value.finalizedBy(), value.finalizedAt(), value.errorCode(), value.errorMessage(),
                lineViews, tenderViews, eventViews);
    }

    private String tenderType(String method) {
        return switch (method) {
            case "CASH" -> "CASH";
            case "BANK_CARD" -> "BANK_CARD";
            case "WECHAT", "ALIPAY" -> "DIGITAL";
            case "MEDICAL_INSURANCE" -> "PERSONAL_ACCOUNT";
            default -> "COMMERCIAL_INSURANCE";
        };
    }
    private void allocateLines(List<SettlementLine> values, BigDecimal total, BigDecimal insurance, BigDecimal other) {
        BigDecimal insuranceAssigned = BigDecimal.ZERO.setScale(6);
        BigDecimal otherAssigned = BigDecimal.ZERO.setScale(6);
        for (int index = 0; index < values.size(); index++) {
            SettlementLine line = values.get(index);
            boolean last = index == values.size() - 1;
            BigDecimal lineInsurance = last ? insurance.subtract(insuranceAssigned)
                    : insurance.multiply(line.netAmount()).divide(total, 6, RoundingMode.HALF_UP);
            BigDecimal lineOther = last ? other.subtract(otherAssigned)
                    : other.multiply(line.netAmount()).divide(total, 6, RoundingMode.HALF_UP);
            line.applyAllocation(lineInsurance, lineOther);
            insuranceAssigned = insuranceAssigned.add(lineInsurance); otherAssigned = otherAssigned.add(lineOther);
        }
    }
    private void recordInsuranceLedger(ExecutionContext context, Settlement settlement, Long responseId,
                                       String type, BigDecimal amount, Instant occurredAt) {
        if (amount.signum() <= 0 || ledger.existsByTenantIdAndClaimResponseIdAndEntryType(
                context.tenantId(), responseId, type)) return;
        ledger.save(LedgerEntry.insurance(context.tenantId(), settlement.patientAccountId(), type, amount,
                settlement.currencyCode(), settlement.legacyInvoiceId(), responseId, occurredAt, context.subjectId()));
    }
    private void recordInsuranceLedgerReversal(ExecutionContext context, Settlement settlement,
                                               Long originalResponseId, Long reversalResponseId,
                                               String type, BigDecimal amount, Instant occurredAt) {
        if (amount.signum() <= 0 || ledger.existsByTenantIdAndClaimResponseIdAndEntryType(
                context.tenantId(), reversalResponseId, type)) return;
        Long originalLedgerId = ledger.findByTenantIdAndClaimResponseIdAndEntryType(
                context.tenantId(), originalResponseId, type).map(LedgerEntry::id).orElse(null);
        ledger.save(LedgerEntry.insuranceReversal(context.tenantId(), settlement.patientAccountId(), type,
                amount, settlement.currencyCode(), settlement.legacyInvoiceId(), reversalResponseId,
                originalLedgerId, occurredAt, context.subjectId()));
    }
    private String scene(String value, String fallback) { return clean(value) == null ? fallback : clean(value).toUpperCase(); }
    private String terminal(String value, String fallback) { return clean(value) == null ? fallback : clean(value).toUpperCase(); }
    private String clean(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    private BigDecimal money(BigDecimal value) { return value.setScale(6, RoundingMode.HALF_UP); }
}
