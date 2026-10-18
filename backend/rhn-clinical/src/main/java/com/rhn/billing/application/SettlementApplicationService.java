package com.rhn.billing.application;

import com.rhn.billing.api.BillingViews.SettlementEventView;
import com.rhn.billing.api.BillingViews.SettlementLineView;
import com.rhn.billing.api.BillingViews.SettlementRecordView;
import com.rhn.billing.api.BillingViews.SettlementTenderView;
import com.rhn.billing.api.BillingViews.SettlementView;
import com.rhn.billing.api.ReliefViews;
import com.rhn.billing.domain.ChargeCategory;
import com.rhn.billing.domain.ChargeItem;
import com.rhn.billing.domain.Invoice;
import com.rhn.billing.domain.InvoiceLine;
import com.rhn.billing.domain.LedgerEntry;
import com.rhn.billing.domain.PatientAccount;
import com.rhn.billing.domain.Payment;
import com.rhn.billing.domain.Settlement;
import com.rhn.billing.domain.SettlementStatus;
import com.rhn.billing.domain.SettlementCategorySummary;
import com.rhn.billing.domain.SettlementEvent;
import com.rhn.billing.domain.SettlementLine;
import com.rhn.billing.domain.SettlementTender;
import com.rhn.billing.infrastructure.PatientAccountRepository;
import com.rhn.billing.infrastructure.ChargeItemRepository;
import com.rhn.billing.infrastructure.LedgerEntryRepository;
import com.rhn.billing.infrastructure.SettlementCategorySummaryRepository;
import com.rhn.billing.infrastructure.SettlementEventRepository;
import com.rhn.billing.infrastructure.SettlementLineRepository;
import org.springframework.beans.factory.annotation.Autowired;
import com.rhn.billing.infrastructure.SettlementRepository;
import com.rhn.billing.infrastructure.SettlementTenderRepository;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.text.Strings;
import com.rhn.healthcore.api.ResidentDirectory;
import com.rhn.healthcore.api.ResidentDirectory.ResidentSnapshot;
import com.rhn.outpatient.api.EncounterDirectory;
import com.rhn.outpatient.api.EncounterDirectory.EncounterSnapshot;
import com.rhn.platform.eventing.api.DomainEventPublisher;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.data.domain.PageRequest;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.List;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
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
    private final ChargeItemRepository chargeItems;
    private final LedgerEntryRepository ledger;
    private final ExecutionContextProvider contextProvider;
    private final DomainEventPublisher eventPublisher;
    private final ResidentDirectory residentDirectory;
    private final EncounterDirectory encounterDirectory;
    private final ChargeCategoryResolver categoryResolver;
    private final BillingCashierResolver cashierResolver;
    private final com.rhn.billing.infrastructure.PaymentOrderRepository paymentOrders;
    private final BillingCodes codes;
    private final SettlementReliefService relief;

    @Autowired
    public SettlementApplicationService(SettlementRepository settlements, SettlementLineRepository lines,
                                        SettlementTenderRepository tenders, SettlementEventRepository events,
                                        SettlementCategorySummaryRepository categories,
                                        PatientAccountRepository accounts, ChargeItemRepository chargeItems,
                                        LedgerEntryRepository ledger, ExecutionContextProvider contextProvider,
                                        DomainEventPublisher eventPublisher, ResidentDirectory residentDirectory,
                                        EncounterDirectory encounterDirectory,
                                        ChargeCategoryResolver categoryResolver, BillingCashierResolver cashierResolver,
                                        com.rhn.billing.infrastructure.PaymentOrderRepository paymentOrders,
                                        BillingCodes codes, SettlementReliefService relief) {
        this.settlements = settlements; this.lines = lines; this.tenders = tenders; this.events = events;
        this.categories = categories; this.accounts = accounts; this.chargeItems = chargeItems;
        this.ledger = ledger; this.contextProvider = contextProvider; this.eventPublisher = eventPublisher;
        this.residentDirectory = residentDirectory; this.encounterDirectory = encounterDirectory;
        this.categoryResolver = categoryResolver != null ? categoryResolver : new ChargeCategoryResolver(null);
        this.cashierResolver = cashierResolver;
        this.paymentOrders = paymentOrders;
        this.codes = codes;
        this.relief = relief;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    Settlement createFromInvoice(ExecutionContext context, PatientAccount account, Invoice invoice,
                                 List<ChargeItem> chargeItems, List<InvoiceLine> invoiceLines,
                                 String settlementScene, String terminalScene, String terminalCode) {
        return createFromInvoice(context, account, invoice, chargeItems, invoiceLines, settlementScene, terminalScene,
                terminalCode, null);
    }

    /** settlementMode：SELF_PAY 或 MEDICAL_INSURANCE，决定医保前减免是否包含仅限自费患者的政策。 */
    @Transactional(propagation = Propagation.MANDATORY)
    Settlement createFromInvoice(ExecutionContext context, PatientAccount account, Invoice invoice,
                                 List<ChargeItem> chargeItems, List<InvoiceLine> invoiceLines,
                                 String settlementScene, String terminalScene, String terminalCode,
                                 String settlementMode) {
        Settlement existing = settlements.findByTenantIdAndLegacyInvoiceId(context.tenantId(), invoice.id()).orElse(null);
        if (existing != null) return existing;
        String type = "CREDIT".equals(invoice.invoiceType()) ? "REVERSAL" : "NORMAL";
        Settlement value = settlements.save(new Settlement(invoice.id(), context.tenantId(),
                account.organizationId(), account.departmentId(), account.id(), invoice.id(),
                invoice.invoiceNo(), "SETTLE-" + invoice.invoiceNo(), type,
                codes.settlementScene(settlementScene, "OUTPATIENT"), codes.paymentScene(context.tenantId(), terminalScene),
                invoice.netAmount(), invoice.currencyCode(), Strings.trimToNull(terminalCode), context.subjectId(), invoice.issuedAt()));
        Map<Long, ChargeItem> byId = chargeItems.stream().collect(java.util.stream.Collectors.toMap(ChargeItem::id, item -> item));
        for (InvoiceLine line : invoiceLines) {
            ChargeItem charge = byId.get(line.chargeItemId());
            lines.save(new SettlementLine(context.tenantId(), value.id(), line.chargeItemId(), line.id(),
                    line.lineNo(), charge.quantity(), line.amount()));
        }
        Map<ChargeCategory, BigDecimal> categoryAmounts = new LinkedHashMap<>();
        for (ChargeItem charge : chargeItems) categoryAmounts.merge(categoryResolver.resolve(context.tenantId(), charge),
                charge.totalAmount(), BigDecimal::add);
        categoryAmounts.forEach((category, amount) -> categories.save(new SettlementCategorySummary(
                context.tenantId(), value.id(), category.code(), category.name(), money(amount), invoice.issuedAt())));
        events.save(new SettlementEvent(context.tenantId(), value.id(), "CREATE", null, value.status().name(),
                "CREATE-" + invoice.invoiceNo(), context.subjectId(), invoice.issuedAt()));
        if ("NORMAL".equals(type)) relief.applyPreInsurance(context, account, value, invoice, settlementMode);
        else relief.reverseForChargeReversals(context, account, chargeItems, value, invoice);
        if ("NORMAL".equals(type) && value.netAmount().signum() == 0) {
            String previous = value.applyPaidAmount(BigDecimal.ZERO.setScale(6), context.subjectId(), invoice.issuedAt());
            events.save(new SettlementEvent(context.tenantId(), value.id(), "FINALIZE", previous,
                    value.status().name(), "ZERO-AMOUNT-" + value.id(), context.subjectId(), invoice.issuedAt()));
            publishStatusTransition(context, value, invoice.id(), previous, invoice.issuedAt());
        }
        return value;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    void applyInpatientPrepayments(ExecutionContext context, Settlement settlement, List<Payment> payments) {
        if (!"INPATIENT".equals(settlement.settlementScene()) || settlement.netAmount().signum() < 0) return;
        if (settlement.status() == SettlementStatus.SETTLED) return;
        if (settlement.netAmount().signum() == 0) {
            Instant occurredAt = Instant.now();
            String previous = settlement.applyPaidAmount(BigDecimal.ZERO.setScale(6), context.subjectId(), occurredAt);
            events.save(new SettlementEvent(context.tenantId(), settlement.id(), "FINALIZE", previous,
                    settlement.status().name(), "ZERO-AMOUNT-" + settlement.id(), context.subjectId(), occurredAt));
            publishStatusTransition(context, settlement, settlement.legacyInvoiceId(), previous, occurredAt);
            return;
        }
        BigDecimal outstanding = money(settlement.netAmount().subtract(
                tenders.totalTendered(context.tenantId(), settlement.id())));
        for (Payment payment : payments) {
            if (outstanding.signum() <= 0) break;
            if (!"PAYMENT".equals(payment.paymentType()) || !"COMPLETED".equals(payment.status())
                    || payment.invoiceId() != null
                    || tenders.findByTenantIdAndPaymentId(context.tenantId(), payment.id()).isPresent()) continue;
            BigDecimal amount = money(payment.amount().min(outstanding));
            if (amount.signum() <= 0) continue;
            int lineNo = Math.toIntExact(tenders.countByTenantIdAndSettlementId(
                    context.tenantId(), settlement.id()) + 1);
            tenders.save(new SettlementTender(context.tenantId(), settlement.id(), payment.id(), lineNo,
                    "PREPAYMENT", payment.paymentMethodCode(), "住院预交金", amount, payment.currencyCode()));
            outstanding = money(outstanding.subtract(amount));
        }
        BigDecimal funded = money(tenders.totalTendered(context.tenantId(), settlement.id()));
        if (funded.signum() <= 0) return;
        Instant occurredAt = Instant.now();
        String previous = settlement.applyPaidAmount(funded, context.subjectId(), occurredAt);
        events.save(new SettlementEvent(context.tenantId(), settlement.id(),
                settlement.status() == SettlementStatus.SETTLED ? "FINALIZE" : "PARTIAL_PAY", previous,
                settlement.status().name(), "PREPAYMENT-" + settlement.id(), context.subjectId(), occurredAt));
        publishStatusTransition(context, settlement, settlement.legacyInvoiceId(), previous, occurredAt);
    }

    @Transactional(propagation = Propagation.MANDATORY)
    void recordPayment(ExecutionContext context, Invoice invoice, Payment payment, BigDecimal paidAmount) {
        if (!"PAYMENT".equals(payment.paymentType())) return;
        Settlement value = settlements.lockByIdAndTenantId(invoice.id(), context.tenantId())
                .orElseThrow(() -> notFound("SETTLEMENT_NOT_FOUND", "未找到正式结算单"));
        if (tenders.findByTenantIdAndPaymentId(context.tenantId(), payment.id()).isPresent()) return;
        int lineNo = Math.toIntExact(tenders.countByTenantIdAndSettlementId(context.tenantId(), value.id()) + 1);
        tenders.save(new SettlementTender(context.tenantId(), value.id(), payment.id(), lineNo,
                codes.requireTenderType(context.tenantId(), payment.paymentMethodCode()), payment.paymentMethodCode(), payment.paymentMethodCode(),
                payment.amount(), payment.currencyCode()));
        String previous = value.applyPaidAmount(money(tenders.totalTendered(context.tenantId(), value.id())),
                context.subjectId(), payment.paidAt());
        if (value.status() == SettlementStatus.SETTLED && payment.paymentOrderId() != null && paymentOrders != null) {
            paymentOrders.findByIdAndTenantId(payment.paymentOrderId(), context.tenantId()).ifPresent(order ->
                    value.recordFinalizationTerminal(order.paymentSceneCode(), order.terminalCode()));
        }
        String eventType = value.status() == SettlementStatus.SETTLED ? "FINALIZE" : "PARTIAL_PAY";
        events.save(new SettlementEvent(context.tenantId(), value.id(), eventType, previous, value.status().name(),
                "PAYMENT-" + payment.id(), context.subjectId(), payment.paidAt()));
        publishStatusTransition(context, value, invoice.id(), previous, payment.paidAt());
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
        accounts.findByIdAndTenantId(value.patientAccountId(), context.tenantId())
                .ifPresent(account -> relief.applyAfterInsurance(context, account, value));
        BigDecimal funded = money(tenders.totalTendered(context.tenantId(), settlementId));
        String previous = value.applyPaidAmount(funded, context.subjectId(), occurredAt);
        events.save(new SettlementEvent(context.tenantId(), settlementId,
                value.status() == SettlementStatus.SETTLED ? "FINALIZE" : "PARTIAL_PAY", previous, value.status().name(),
                "INSURANCE-" + claimResponseId, context.subjectId(), occurredAt));
        publishStatusTransition(context, value, value.legacyInvoiceId(), previous, occurredAt);
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
                value.status().name(), "INSURANCE-REVERSE-" + reversalClaimResponseId,
                context.subjectId(), occurredAt));
        publishStatusTransition(context, value, value.legacyInvoiceId(), previous, occurredAt);
    }

    private void publishStatusTransition(ExecutionContext context, Settlement settlement, Long invoiceId,
                                         String previousStatus, Instant occurredAt) {
        boolean finalized = !"SETTLED".equals(previousStatus) && settlement.status() == SettlementStatus.SETTLED;
        boolean reversed = "SETTLED".equals(previousStatus) && settlement.status() != SettlementStatus.SETTLED;
        if (!finalized && !reversed) return;
        if (finalized) relief.confirmQuota(context, settlement, occurredAt);
        PatientAccount account = accounts.findByIdAndTenantId(settlement.patientAccountId(), context.tenantId())
                .orElseThrow(() -> notFound("PATIENT_ACCOUNT_NOT_FOUND", "未找到患者费用账户"));
        List<ChargeItem> settledCharges = lines
                .findByTenantIdAndSettlementIdOrderByLineNoAsc(context.tenantId(), settlement.id()).stream()
                .map(line -> chargeItems.findByIdAndTenantId(line.chargeItemId(), context.tenantId()).orElse(null))
                .filter(java.util.Objects::nonNull).toList();
        Map<Long, BigDecimal> requestAmounts = settledCharges.stream()
                .filter(charge -> charge.requestId() != null)
                .collect(java.util.stream.Collectors.toMap(ChargeItem::requestId, ChargeItem::totalAmount, BigDecimal::add));
        List<Map<String, Object>> medicationRequests = settledCharges.stream()
                .filter(charge -> charge.requestId() != null && charge.totalAmount().signum() > 0
                        && requestAmounts.get(charge.requestId()).signum() > 0
                        && charge.sourceType().startsWith("MEDICATION_"))
                .map(charge -> {
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("requestId", charge.requestId());
                    item.put("organizationId", account.organizationId());
                    item.put("departmentId", account.departmentId());
                    return Map.copyOf(item);
                }).distinct().toList();
        List<Map<String, Object>> serviceRequests = settledCharges.stream()
                .filter(charge -> charge.requestId() != null && charge.totalAmount().signum() > 0
                        && requestAmounts.get(charge.requestId()).signum() > 0
                        && "SERVICE_REQUEST".equals(charge.sourceType()))
                .map(charge -> {
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("requestId", charge.requestId());
                    item.put("organizationId", account.organizationId());
                    item.put("departmentId", account.departmentId());
                    return Map.copyOf(item);
                }).distinct().toList();
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("settlementId", settlement.id());
        if (invoiceId != null) payload.put("invoiceId", invoiceId);
        if (account.encounterId() != null) payload.put("encounterId", account.encounterId());
        payload.put("medicationRequests", medicationRequests);
        payload.put("serviceRequests", serviceRequests);
        eventPublisher.publish(context.tenantId(), account.organizationId(),
                finalized ? "BILLING_SETTLEMENT_FINALIZED" : "BILLING_SETTLEMENT_REVERSED", 1,
                "Settlement", settlement.id(), settlement.revision() + 1, account.residentId(), occurredAt, payload);
    }

    @Transactional(propagation = Propagation.MANDATORY)
    void recordPaymentRequested(ExecutionContext context, Long settlementId, Long paymentOrderId) {
        Settlement value = settlements.lockByIdAndTenantId(settlementId, context.tenantId())
                .orElseThrow(() -> notFound("SETTLEMENT_NOT_FOUND", "未找到正式结算单"));
        String command = "PAYMENT-REQUEST-" + paymentOrderId;
        if (events.findByTenantIdAndSettlementIdAndCommandCode(context.tenantId(), settlementId, command).isPresent()) return;
        String previous = value.requestPayment();
        events.save(new SettlementEvent(context.tenantId(), settlementId, "REQUEST_PAYMENT", previous,
                value.status().name(), command, context.subjectId(), Instant.now()));
    }

    /** 结算减免概况：已落账减免与当前可执行的医保后政策预览。 */
    @Transactional(readOnly = true)
    public ReliefViews.SettlementReliefView relief(Long settlementId) {
        ExecutionContext context = contextProvider.requireCurrent();
        Settlement value = requireAccessible(context, settlementId, false);
        PatientAccount account = accounts.findByIdAndTenantId(value.patientAccountId(), context.tenantId()).orElseThrow();
        boolean payable = List.of(SettlementStatus.PRICED, SettlementStatus.PAYMENT_PENDING, SettlementStatus.PARTIAL)
                .contains(value.status());
        return reliefView(context, value, payable ? relief.previewPostInsurance(context, account, value) : List.of());
    }

    /**
     * 确认医保后减免：自费患者在收款前确认；医保患者在正式结算后补充人工核准项。已执行的政策不会重复执行。
     * 减免作为非患者资金计入结算，个人应付为零时结算直接完成。
     */
    @Transactional
    public ReliefViews.SettlementReliefView confirmRelief(Long settlementId, ConfirmReliefCommand input) {
        ExecutionContext context = contextProvider.requireCurrent();
        Settlement value = requireAccessible(context, settlementId, true);
        if (!List.of(SettlementStatus.PRICED, SettlementStatus.PAYMENT_PENDING, SettlementStatus.PARTIAL)
                .contains(value.status())) {
            throw conflict("RELIEF_SETTLEMENT_STATE_INVALID", "结算已完成或已冲正，不能再确认减免");
        }
        PatientAccount account = accounts.findByIdAndTenantId(value.patientAccountId(), context.tenantId()).orElseThrow();
        Map<Long, SettlementReliefService.ManualDecision> manual = new LinkedHashMap<>();
        for (ManualReliefInput item : input == null || input.manual() == null ? List.<ManualReliefInput>of() : input.manual()) {
            if (item.policyId() == null || manual.put(item.policyId(), new SettlementReliefService.ManualDecision(
                    item.amount(), item.reason(), item.evidence())) != null) {
                throw badRequest("RELIEF_MANUAL_POLICY_INVALID", "人工核准的政策缺失或重复");
            }
        }
        BigDecimal before = value.reliefAmount();
        List<ReliefViews.ReliefOutcomeView> outcomes = relief.applyPostInsurance(context, account, value, manual, "RELIEF-POST-");
        if (value.reliefAmount().compareTo(before) != 0) {
            Instant occurredAt = Instant.now();
            String previous = value.applyPaidAmount(money(tenders.totalTendered(context.tenantId(), value.id())),
                    context.subjectId(), occurredAt);
            events.save(new SettlementEvent(context.tenantId(), value.id(),
                    value.status() == SettlementStatus.SETTLED ? "FINALIZE" : "PARTIAL_PAY", previous,
                    value.status().name(), "RELIEF-" + value.id() + "-" + occurredAt.toEpochMilli(),
                    context.subjectId(), occurredAt));
            publishStatusTransition(context, value, value.legacyInvoiceId(), previous, occurredAt);
        }
        return reliefView(context, value, outcomes);
    }

    private Settlement requireAccessible(ExecutionContext context, Long settlementId, boolean lock) {
        Settlement value = (lock ? settlements.lockByIdAndTenantId(settlementId, context.tenantId())
                : settlements.findByIdAndTenantId(settlementId, context.tenantId()))
                .orElseThrow(() -> notFound("SETTLEMENT_NOT_FOUND", "未找到正式结算单"));
        PatientAccount account = accounts.findByIdAndTenantId(value.patientAccountId(), context.tenantId())
                .orElseThrow(() -> notFound("PATIENT_ACCOUNT_NOT_FOUND", "未找到患者费用账户"));
        if (!context.hasWorkContext() || !context.canAccessOrganization(account.organizationId())) {
            throw forbidden("SETTLEMENT_FORBIDDEN", "当前工作上下文不能访问该结算单");
        }
        return value;
    }

    private ReliefViews.SettlementReliefView reliefView(ExecutionContext context, Settlement value,
                                                        List<ReliefViews.ReliefOutcomeView> pending) {
        BigDecimal tendered = money(tenders.totalTendered(context.tenantId(), value.id()));
        return new ReliefViews.SettlementReliefView(value.id(), value.discountAmount(), value.reliefAmount(),
                money(value.netAmount().subtract(tendered)), relief.applications(context, value.id()), pending);
    }

    /** 由医保结算前置检查调用：已按自费享受减免的结算不能再走医保。 */
    @Transactional(propagation = Propagation.MANDATORY)
    void requireInsuranceAllowed(ExecutionContext context, Long settlementId) {
        relief.requireInsuranceAllowed(context, settlementId);
    }

    public record ManualReliefInput(Long policyId, BigDecimal amount, String reason, String evidence) {}

    public record ConfirmReliefCommand(List<ManualReliefInput> manual) {}

    @Transactional(readOnly = true)
    public SettlementView get(Long settlementId) {
        ExecutionContext context = contextProvider.requireCurrent();
        Settlement value = settlements.findByIdAndTenantId(settlementId, context.tenantId())
                .orElseThrow(() -> notFound("SETTLEMENT_NOT_FOUND", "未找到正式结算单"));
        PatientAccount account = accounts.findByIdAndTenantId(value.patientAccountId(), context.tenantId())
                .orElseThrow(() -> notFound("PATIENT_ACCOUNT_NOT_FOUND", "未找到患者费用账户"));
        if (!context.hasWorkContext() || !context.canAccessOrganization(account.organizationId())) {
            throw forbidden("SETTLEMENT_FORBIDDEN", "当前工作上下文不能访问该结算单");
        }
        return view(context, value);
    }

    @Transactional(readOnly = true)
    public List<SettlementRecordView> recentCompleted(int limit) {
        ExecutionContext context = contextProvider.requireCurrent();
        if (!context.hasWorkContext()) {
            throw forbidden("SETTLEMENT_QUERY_CONTEXT_REQUIRED", "收费查询需要机构工作上下文");
        }
        int boundedLimit = Math.max(1, Math.min(limit, 500));
        List<Settlement> values = settlements.findRecentCompleted(context.tenantId(), context.organizationId(),
                SettlementStatus.SETTLED, PageRequest.of(0, boundedLimit));
        return recordViews(context, values);
    }

    @Transactional(readOnly = true)
    public List<SettlementRecordView> completedInRange(int limit, java.time.LocalDate from, java.time.LocalDate to, String cashier) {
        ExecutionContext context = contextProvider.requireCurrent();
        if (!context.hasWorkContext()) throw forbidden("SETTLEMENT_QUERY_CONTEXT_REQUIRED", "收费查询需要机构工作上下文");
        if (from == null || to == null || from.isAfter(to)) throw com.rhn.shared.api.BusinessErrors.badRequest("SETTLEMENT_QUERY_DATE_REQUIRED", "结算开始日期和结束日期不能为空，且开始日期不能晚于结束日期");
        var zone = java.time.ZoneId.of("Asia/Shanghai");
        var start = from.atStartOfDay(zone).toInstant();
        var end = to.plusDays(1).atStartOfDay(zone).toInstant();
        String text = Strings.trimToNull(cashier);
        List<Long> ids = new java.util.ArrayList<>();
        if (text != null) {
            var search = text.toLowerCase(java.util.Locale.ROOT);
            for (Long id : settlements.findFinalizersInRange(context.tenantId(), context.organizationId(), SettlementStatus.SETTLED, start, end)) {
                var person = cashierResolver.resolve(context.tenantId(), id);
                if (java.util.stream.Stream.of(person.name(), person.username(), id.toString()).filter(java.util.Objects::nonNull)
                        .anyMatch(v -> v.toLowerCase(java.util.Locale.ROOT).contains(search))) ids.add(id);
            }
            if (ids.isEmpty()) return List.of();
        }
        return recordViews(context, settlements.findCompletedInRange(context.tenantId(), context.organizationId(), SettlementStatus.SETTLED,
                start, end, text != null, ids.isEmpty() ? List.of(-1L) : ids, PageRequest.of(0, Math.max(1, Math.min(limit, 500)))));
    }

    private List<SettlementRecordView> recordViews(ExecutionContext context, List<Settlement> values) {
        Map<Long, BillingCashierResolver.Cashier> cashiers = new HashMap<>();
        Collection<Long> accountIds = values.stream().map(Settlement::patientAccountId).collect(Collectors.toSet());
        Map<Long, PatientAccount> accountById = accountIds.isEmpty() ? Map.of() : accounts
                .findByTenantIdAndIdIn(context.tenantId(), accountIds).stream()
                .collect(Collectors.toMap(PatientAccount::id, Function.identity()));
        Collection<Long> encounterIds = accountById.values().stream().map(PatientAccount::encounterId)
                .filter(java.util.Objects::nonNull).collect(Collectors.toSet());
        Map<Long, EncounterSnapshot> encounterById = encounterDirectory.findOrganizationAccessible(encounterIds)
                .stream().collect(Collectors.toMap(EncounterSnapshot::id, Function.identity()));
        Map<Long, ResidentSnapshot> residentById = new HashMap<>();
        return values.stream().map(value -> {
            PatientAccount account = accountById.get(value.patientAccountId());
            if (account == null) return null;
            ResidentSnapshot resident = residentById.computeIfAbsent(account.residentId(),
                    residentId -> residentDirectory.requireSnapshot(context.tenantId(), residentId));
            EncounterSnapshot encounter = account.encounterId() == null ? null : encounterById.get(account.encounterId());
            var cashier = value.finalizedBy() == null || cashierResolver == null ? new BillingCashierResolver.Cashier(null, null)
                    : cashiers.computeIfAbsent(value.finalizedBy(), id -> cashierResolver.resolve(context.tenantId(), id));
            return new SettlementRecordView(value.id(), account.id(), account.residentId(), account.encounterId(),
                    account.departmentId(), resident.fullName(), resident.healthRecordNo(), resident.gender(),
                    resident.birthDate(), encounter == null ? null : encounter.encounterNo(),
                    encounter == null ? null : encounter.departmentName(),
                    value.settlementNo(), value.settlementType(), value.settlementScene(),
                    value.terminalScene(), value.status().name(), value.grossAmount(), value.discountAmount(),
                    value.insuranceAmount(), value.patientAmount(), value.otherAmount(), value.roundingAmount(),
                    value.netAmount(), value.currencyCode(), value.terminalCode(), value.createdAt(), value.finalizedAt(), value.finalizedBy(), cashier.name(), cashier.username());
        }).filter(java.util.Objects::nonNull).toList();
    }

    Settlement requireForPayment(ExecutionContext context, Long settlementId) {
        Settlement value = settlements.findByIdAndTenantId(settlementId, context.tenantId())
                .orElseThrow(() -> notFound("SETTLEMENT_NOT_FOUND", "未找到正式结算单"));
        if (!List.of(SettlementStatus.PRICED, SettlementStatus.PAYMENT_PENDING, SettlementStatus.PARTIAL).contains(value.status())) {
            throw com.rhn.shared.api.BusinessErrors.conflict("SETTLEMENT_NOT_PAYABLE", "当前结算单状态不允许发起支付");
        }
        return value;
    }

    BigDecimal nonPaymentTendered(ExecutionContext context, Long settlementId) {
        return money(tenders.nonPaymentTendered(context.tenantId(), settlementId));
    }

    BigDecimal tenderedForInvoice(ExecutionContext context, Long invoiceId) {
        return settlements.findByTenantIdAndLegacyInvoiceId(context.tenantId(), invoiceId)
                .map(value -> money(tenders.totalTendered(context.tenantId(), value.id())))
                .orElse(null);
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
                value.settlementScene(), value.terminalScene(), value.status().name(), value.grossAmount(),
                value.discountAmount(), value.insuranceAmount(), value.patientAmount(), value.otherAmount(),
                value.reliefAmount(), value.roundingAmount(), value.netAmount(), tendered, money(value.netAmount().subtract(tendered)),
                value.currencyCode(), value.terminalCode(), value.createdBy(), value.createdAt(),
                value.finalizedBy(), value.finalizedAt(), value.errorCode(), value.errorMessage(),
                lineViews, tenderViews, eventViews);
    }

    private ChargeCategory chargeCategory(ChargeItem charge) {
        return categoryResolver.resolve(null, charge);
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
    private BigDecimal money(BigDecimal value) { return value.setScale(6, RoundingMode.HALF_UP); }
}
