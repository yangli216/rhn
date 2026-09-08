package com.rhn.billing.application;

import com.rhn.billing.api.BillingViews.AccountStatementView;
import com.rhn.billing.api.BillingViews.ChargeItemView;
import com.rhn.billing.api.BillingViews.ChargeSynchronizationView;
import com.rhn.billing.api.BillingViews.BillingWorkItemView;
import com.rhn.billing.api.BillingViews.DailyReconciliationView;
import com.rhn.billing.api.BillingViews.InvoiceLineView;
import com.rhn.billing.api.BillingViews.InvoiceView;
import com.rhn.billing.api.BillingViews.LedgerEntryView;
import com.rhn.billing.api.BillingViews.PaymentView;
import com.rhn.billing.api.BillingViews.ReconciliationLineView;
import com.rhn.billing.domain.ChargeItem;
import com.rhn.billing.domain.ChargeItemComponent;
import com.rhn.billing.domain.Invoice;
import com.rhn.billing.domain.InvoiceCategorySummary;
import com.rhn.billing.domain.InvoiceLine;
import com.rhn.billing.domain.LedgerEntry;
import com.rhn.billing.domain.PatientAccount;
import com.rhn.billing.domain.Payment;
import com.rhn.billing.domain.Settlement;
import com.rhn.billing.infrastructure.ChargeItemComponentRepository;
import com.rhn.billing.infrastructure.ChargeItemRepository;
import com.rhn.billing.infrastructure.InvoiceCategorySummaryRepository;
import com.rhn.billing.infrastructure.InvoiceLineRepository;
import com.rhn.billing.infrastructure.InvoiceRepository;
import com.rhn.billing.infrastructure.LedgerEntryRepository;
import com.rhn.billing.infrastructure.PatientAccountRepository;
import com.rhn.billing.infrastructure.PaymentRepository;
import com.rhn.healthcore.api.ResidentDirectory;
import com.rhn.healthcore.api.ResidentDirectory.ResidentSnapshot;
import com.rhn.outpatient.api.EncounterDirectory;
import com.rhn.outpatient.api.EncounterDirectory.EncounterSnapshot;
import com.rhn.outpatient.api.MedicationRequestDirectory;
import com.rhn.outpatient.api.MedicationRequestDirectory.MedicationRequestSnapshot;
import com.rhn.pharmacy.api.DispenseBillingDirectory;
import com.rhn.pharmacy.api.DispenseBillingDirectory.DispenseBillingFact;
import com.rhn.platform.eventing.api.DomainEventPublisher;
import com.rhn.platform.dictionary.api.DictionaryAttributeDirectory;
import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory;
import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory.CatalogOperationalSnapshot;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.LinkedHashMap;
import java.util.Objects;
import java.util.Set;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class BillingApplicationService {
    private final PatientAccountRepository accountRepository;
    private final ChargeItemRepository chargeRepository;
    private final ChargeItemComponentRepository componentRepository;
    private final InvoiceRepository invoiceRepository;
    private final InvoiceLineRepository invoiceLineRepository;
    private final InvoiceCategorySummaryRepository categoryRepository;
    private final PaymentRepository paymentRepository;
    private final LedgerEntryRepository ledgerRepository;
    private final DispenseBillingDirectory dispenseDirectory;
    private final EncounterDirectory encounterDirectory;
    private final ResidentDirectory residentDirectory;
    private final MedicationRequestDirectory medicationRequestDirectory;
    private final CatalogLifecycleDirectory catalogDirectory;
    private final DomainEventPublisher eventPublisher;
    private final DictionaryAttributeDirectory dictionaryAttributeDirectory;
    private final ExecutionContextProvider contextProvider;
    private final SettlementApplicationService settlements;

    public BillingApplicationService(
            PatientAccountRepository accountRepository, ChargeItemRepository chargeRepository,
            ChargeItemComponentRepository componentRepository, InvoiceRepository invoiceRepository,
            InvoiceLineRepository invoiceLineRepository, InvoiceCategorySummaryRepository categoryRepository,
            PaymentRepository paymentRepository, LedgerEntryRepository ledgerRepository,
            DispenseBillingDirectory dispenseDirectory,
            EncounterDirectory encounterDirectory, ResidentDirectory residentDirectory,
            MedicationRequestDirectory medicationRequestDirectory,
            CatalogLifecycleDirectory catalogDirectory, DomainEventPublisher eventPublisher,
            DictionaryAttributeDirectory dictionaryAttributeDirectory,
            ExecutionContextProvider contextProvider,
            SettlementApplicationService settlements) {
        this.accountRepository = accountRepository; this.chargeRepository = chargeRepository;
        this.componentRepository = componentRepository; this.invoiceRepository = invoiceRepository;
        this.invoiceLineRepository = invoiceLineRepository; this.categoryRepository = categoryRepository;
        this.paymentRepository = paymentRepository; this.ledgerRepository = ledgerRepository;
        this.dispenseDirectory = dispenseDirectory;
        this.encounterDirectory = encounterDirectory; this.residentDirectory = residentDirectory;
        this.medicationRequestDirectory = medicationRequestDirectory;
        this.catalogDirectory = catalogDirectory; this.eventPublisher = eventPublisher;
        this.dictionaryAttributeDirectory = dictionaryAttributeDirectory;
        this.contextProvider = contextProvider;
        this.settlements = settlements;
    }

    @Transactional
    public ChargeSynchronizationView synchronizeMedicationCharges(Long encounterId, SynchronizeCommand input) {
        ExecutionContext context = requireWorkContext(); String requestCode = required(input.requestCode(),
                "BILLING_SYNCHRONIZE_REQUEST_CODE_REQUIRED", "计费同步请求编码不能为空");
        EncounterSnapshot encounter = requireEncounter(context, encounterId);
        List<DispenseBillingFact> events = dispenseDirectory.findByEncounter(context.tenantId(), encounterId);
        if (events.isEmpty()) throw conflict("BILLING_NO_DISPENSE_FACT", "当前就诊尚无可计费的实际发退药事实");

        PatientAccount account = null; String currency = null; int created = 0; int existing = 0;
        for (DispenseBillingFact event : events) {
            String sourceType = sourceType(event);
            ChargeItem current = chargeRepository.findByTenantIdAndSourceTypeAndSourceId(
                    context.tenantId(), sourceType, event.id()).orElse(null);
            if (current == null && "MEDICATION_DISPENSE".equals(sourceType) && event.requestId() != null) {
                current = chargeRepository.findByTenantIdAndSourceTypeAndSourceId(
                        context.tenantId(), "MEDICATION_REQUEST", event.requestId()).orElse(null);
            }
            if (current != null) {
                existing++; account = requireAccount(context, current.patientAccountId());
                currency = requireSameCurrency(currency, current.currencyCode()); continue;
            }
            boolean reversal = "MEDICATION_RETURN".equals(sourceType);
            ChargeItem original = reversal ? requireOriginalCharge(context, event) : null;
            ChargePricing pricing = reversal ? reversalPricing(context, event, original) : pricing(context, event);
            currency = requireSameCurrency(currency, pricing.currencyCode());
            if (account == null) account = findOrCreateAccount(context, encounter, currency);
            if (!account.currencyCode().equals(currency)) throw conflict(
                    "BILLING_ENCOUNTER_MULTI_CURRENCY_UNSUPPORTED", "本轮门诊结算不允许同一就诊混用多个币种");

            BigDecimal quantity = reversal ? event.operationQuantity().negate() : event.operationQuantity();
            BigDecimal amount = reversal ? pricing.amount().negate() : pricing.amount();
            BigDecimal unitPrice = pricing.unitPrice();
            ChargeItem charge = chargeRepository.save(new ChargeItem(context.tenantId(), account.id(),
                    encounter.residentId(), encounter.id(), pricing.requestId(), pricing.catalogItemId(),
                    sourceType, event.id(), requestCode, quantity, event.operationUnitCode(), unitPrice, amount,
                    currency, pricing.priceId(), pricing.priceRevision(), pricing.priceType(),
                    pricing.itemCode(), pricing.itemName(),
                    event.occurredAt(), context.subjectId(), original == null ? null : original.id()));
            componentRepository.save(new ChargeItemComponent(context.tenantId(), charge.id(), charge.catalogItemId(),
                    charge.itemCodeSnapshot(), charge.itemNameSnapshot(), quantity, charge.unitCode(),
                    pricing.unitFactor(), unitPrice, amount));
            if (amount.signum() != 0) {
                Long reversesLedger = original == null ? null : ledgerRepository
                        .findByTenantIdAndChargeItemId(context.tenantId(), original.id())
                        .map(LedgerEntry::id).orElse(null);
                ledgerRepository.save(new LedgerEntry(context.tenantId(), account.id(),
                        reversal ? "CHARGE_REVERSAL" : "CHARGE", reversal ? "CREDIT" : "DEBIT",
                        amount.abs(), currency, charge.id(), null, null, reversesLedger,
                        event.occurredAt(), context.subjectId()));
            }
            created++;
        }
        PatientAccount resultAccount = account;
        if (resultAccount == null) throw conflict("BILLING_ACCOUNT_NOT_CREATED", "未能形成患者费用账户");
        eventPublisher.publish(context.tenantId(), encounter.organizationId(), "BILLING_CHARGES_SYNCHRONIZED", 1,
                "PatientAccount", resultAccount.id(), resultAccount.revision(), encounter.residentId(), Instant.now(),
                Map.of("encounterId", encounter.id(), "createdCharges", created, "existingCharges", existing));
        return new ChargeSynchronizationView(created, existing, statement(context, resultAccount));
    }

    @Transactional(readOnly = true)
    public AccountStatementView encounterStatement(Long encounterId, String currencyCode) {
        ExecutionContext context = requireWorkContext(); EncounterSnapshot encounter = requireEncounter(context, encounterId);
        String currency = clean(currencyCode) == null ? "CNY" : upper(currencyCode);
        PatientAccount account = accountRepository.findByTenantIdAndEncounterIdAndCurrencyCode(
                        context.tenantId(), encounter.id(), currency)
                .orElseThrow(() -> notFound("PATIENT_ACCOUNT_NOT_FOUND", "当前就诊尚未形成患者费用账户"));
        return statement(context, account);
    }

    @Transactional(readOnly = true)
    public List<BillingWorkItemView> worklist() {
        ExecutionContext context = requireWorkContext();
        Map<Long, List<DispenseBillingFact>> eventsByEncounter = new LinkedHashMap<>();
        for (DispenseBillingFact event : dispenseDirectory.findWorklist(context.tenantId(), context.organizationId())) {
            eventsByEncounter.computeIfAbsent(event.encounterId(), ignored -> new ArrayList<>()).add(event);
        }
        Map<Long, PatientAccount> accountByEncounter = new LinkedHashMap<>();
        for (PatientAccount account : accountRepository
                .findTop200ByTenantIdAndOrganizationIdAndEncounterIdIsNotNullOrderByOpenedAtDesc(
                        context.tenantId(), context.organizationId())) {
            if (!"OUTPATIENT".equals(account.accountType())) continue;
            accountByEncounter.putIfAbsent(account.encounterId(), account);
        }
        List<Long> accountIds = accountByEncounter.values().stream().map(PatientAccount::id).toList();
        Map<Long, List<ChargeItem>> chargesByAccount = new LinkedHashMap<>();
        Set<Long> uninvoicedChargeIds = new HashSet<>();
        Map<Long, BigDecimal> balances = new LinkedHashMap<>();
        if (!accountIds.isEmpty()) {
            for (ChargeItem charge : chargeRepository
                    .findByTenantIdAndPatientAccountIdInOrderByOccurredAtDescIdDesc(context.tenantId(), accountIds)) {
                chargesByAccount.computeIfAbsent(charge.patientAccountId(), ignored -> new ArrayList<>()).add(charge);
            }
            chargeRepository.findUninvoiced(context.tenantId(), accountIds).stream()
                    .map(ChargeItem::id).forEach(uninvoicedChargeIds::add);
            ledgerRepository.balances(context.tenantId(), accountIds).forEach(value ->
                    balances.put(value.getAccountId(), money(value.getBalance())));
        }

        Set<Long> encounterIds = new HashSet<>(eventsByEncounter.keySet());
        encounterIds.addAll(accountByEncounter.keySet());
        Map<Long, EncounterSnapshot> accessibleEncounters = new LinkedHashMap<>();
        for (EncounterSnapshot encounter : encounterDirectory.findOrganizationAccessible(encounterIds)) {
            accessibleEncounters.put(encounter.id(), encounter);
        }
        Map<Long, ResidentSnapshot> residents = new LinkedHashMap<>();
        List<BillingWorkItemView> result = new ArrayList<>();
        for (Long encounterId : encounterIds) {
            EncounterSnapshot encounter = accessibleEncounters.get(encounterId);
            if (encounter == null) continue;
            ResidentSnapshot resident = residents.computeIfAbsent(encounter.residentId(),
                    residentId -> residentDirectory.requireSnapshot(context.tenantId(), residentId));
            List<DispenseBillingFact> events = eventsByEncounter.getOrDefault(encounterId, List.of());
            PatientAccount account = accountByEncounter.get(encounterId);
            List<ChargeItem> charges = account == null ? List.of()
                    : chargesByAccount.getOrDefault(account.id(), List.of());
            int unmatchedEvents = (int) events.stream().filter(event -> !hasCharge(event, charges)).count();
            if (account == null) {
                DispenseBillingFact latest = events.stream().max(Comparator.comparing(DispenseBillingFact::occurredAt))
                        .orElse(null);
                if (latest != null) result.add(new BillingWorkItemView(encounterId, resident.id(),
                        resident.fullName(), resident.healthRecordNo(), resident.gender(), resident.birthDate(),
                        encounter.encounterNo(), null, null, "PENDING_CHARGE", events.size(), 0,
                        latest.dispenseNo(), latest.occurredAt(), BigDecimal.ZERO.setScale(2),
                        BigDecimal.ZERO.setScale(2), encounter.departmentName(), encounter.registeredAt()));
                continue;
            }
            if (charges.isEmpty() && events.isEmpty()) continue;
            BigDecimal balance = balances.getOrDefault(account.id(), BigDecimal.ZERO.setScale(2));
            boolean hasUninvoiced = charges.stream().anyMatch(value -> uninvoicedChargeIds.contains(value.id()));
            String status;
            if (unmatchedEvents > 0) status = "PENDING_CHARGE";
            else if (hasUninvoiced) status = "PENDING_INVOICE";
            else if (balance.signum() > 0) status = "PENDING_PAYMENT";
            else if (balance.signum() < 0) status = "PENDING_REFUND";
            else status = "SETTLED";
            SourceMoment latest = latestSource(events, charges, account.openedAt());
            BigDecimal chargeAmount = money(charges.stream().map(ChargeItem::totalAmount)
                    .reduce(BigDecimal.ZERO, BigDecimal::add));
            result.add(new BillingWorkItemView(encounterId, resident.id(), resident.fullName(),
                    resident.healthRecordNo(), resident.gender(), resident.birthDate(), encounter.encounterNo(),
                    account.id(), account.currencyCode(), status, charges.size() + unmatchedEvents, charges.size(),
                    latest.sourceNo(), latest.occurredAt(), chargeAmount, balance,
                    encounter.departmentName(), encounter.registeredAt()));
        }
        return result.stream().sorted(Comparator.comparing(BillingWorkItemView::latestOccurredAt).reversed())
                .limit(100).toList();
    }

    private boolean hasCharge(DispenseBillingFact event, List<ChargeItem> charges) {
        String directType = sourceType(event);
        return charges.stream().anyMatch(charge -> directType.equals(charge.sourceType())
                && Objects.equals(event.id(), charge.sourceId()))
                || (!"RETURN".equals(event.dispenseType()) && event.requestId() != null
                && charges.stream().anyMatch(charge -> "MEDICATION_REQUEST".equals(charge.sourceType())
                && Objects.equals(event.requestId(), charge.sourceId())));
    }

    private SourceMoment latestSource(List<DispenseBillingFact> events, List<ChargeItem> charges, Instant fallback) {
        DispenseBillingFact event = events.stream().max(Comparator.comparing(DispenseBillingFact::occurredAt))
                .orElse(null);
        ChargeItem charge = charges.stream().max(Comparator.comparing(ChargeItem::occurredAt)).orElse(null);
        if (event != null && (charge == null || !event.occurredAt().isBefore(charge.occurredAt()))) {
            return new SourceMoment(event.dispenseNo(), event.occurredAt());
        }
        return charge == null ? new SourceMoment("ACCOUNT", fallback)
                : new SourceMoment(charge.requestCode(), charge.occurredAt());
    }

    private record SourceMoment(String sourceNo, Instant occurredAt) {}

    @Transactional
    public InvoiceView issueInvoice(Long accountId, IssueInvoiceCommand input) {
        ExecutionContext context = requireWorkContext(); String invoiceNo = required(input.invoiceNo(),
                "INVOICE_NO_REQUIRED", "结算凭证编码不能为空");
        Invoice existing = invoiceRepository.findByTenantIdAndInvoiceNo(context.tenantId(), invoiceNo).orElse(null);
        if (existing != null) return verifyInvoice(context, existing, accountId);
        PatientAccount account = lockAccount(context, accountId);
        existing = invoiceRepository.findByTenantIdAndInvoiceNo(context.tenantId(), invoiceNo).orElse(null);
        if (existing != null) return verifyInvoice(context, existing, accountId);
        List<ChargeItem> charges = chargeRepository.findUninvoiced(context.tenantId(), account.id());
        if (charges.isEmpty()) throw conflict("INVOICE_NO_UNINVOICED_CHARGES", "当前费用账户没有待结算收费事项");
        if (input.chargeItemIds() != null && !input.chargeItemIds().isEmpty()) {
            Set<Long> selectedIds = new HashSet<>(input.chargeItemIds());
            charges = charges.stream().filter(value -> selectedIds.contains(value.id())).toList();
            if (charges.isEmpty()) {
                throw conflict("INVOICE_NO_SELECTED_CHARGES", "所选收费事项已结算或不存在");
            }
        }
        if (charges.stream().anyMatch(value -> !account.currencyCode().equals(value.currencyCode()))) {
            throw conflict("INVOICE_CURRENCY_MISMATCH", "结算凭证内收费事项币种不一致");
        }
        BigDecimal total = money(charges.stream().map(ChargeItem::totalAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add));
        Instant issuedAt = input.issuedAt() == null ? Instant.now() : input.issuedAt();
        Invoice invoice = invoiceRepository.save(new Invoice(context.tenantId(), account.id(), invoiceNo,
                account.currencyCode(), total, issuedAt, context.subjectId()));
        int lineNo = 1; List<InvoiceLine> invoiceLines = new ArrayList<>();
        for (ChargeItem charge : charges) invoiceLines.add(invoiceLineRepository.save(new InvoiceLine(
                context.tenantId(), invoice.id(), charge.id(), lineNo++, charge.totalAmount())));
        Map<ChargeCategory, BigDecimal> categoryAmounts = new LinkedHashMap<>();
        for (ChargeItem charge : charges) categoryAmounts.merge(chargeCategory(charge),
                charge.totalAmount(), BigDecimal::add);
        categoryAmounts.forEach((category, amount) -> categoryRepository.save(new InvoiceCategorySummary(
                context.tenantId(), invoice.id(), category.code(), category.name(), money(amount))));
        var settlement = settlements.createFromInvoice(context, account, invoice, charges, invoiceLines,
                input.settlementScene(), input.terminalScene(), input.terminalCode());
        if ("INPATIENT".equalsIgnoreCase(input.settlementScene())) {
            settlements.applyInpatientPrepayments(context, settlement,
                    paymentRepository.findByTenantIdAndPatientAccountIdOrderByPaidAtAscIdAsc(
                            context.tenantId(), account.id()));
        }
        eventPublisher.publish(context.tenantId(), account.organizationId(), "BILLING_INVOICE_ISSUED", 1,
                "Invoice", invoice.id(), 1L, account.residentId(), issuedAt,
                Map.of("accountId", account.id(), "invoiceNo", invoiceNo, "netAmount", total));
        return invoiceView(context, invoice);
    }

    @Transactional
    public PaymentView collectPayment(Long invoiceId, PaymentCommand input) {
        ExecutionContext context = requireWorkContext(); String paymentNo = required(input.paymentNo(),
                "PAYMENT_NO_REQUIRED", "支付编码不能为空");
        Payment existing = paymentRepository.findByTenantIdAndPaymentNo(context.tenantId(), paymentNo).orElse(null);
        if (existing != null) return verifyPayment(context, existing, invoiceId, input);
        Invoice invoice = requireInvoice(context, invoiceId); PatientAccount account = lockAccount(context, invoice.patientAccountId());
        existing = paymentRepository.findByTenantIdAndPaymentNo(context.tenantId(), paymentNo).orElse(null);
        if (existing != null) return verifyPayment(context, existing, invoiceId, input);
        BigDecimal amount = positiveMoney(input.amount(), "PAYMENT_AMOUNT_INVALID", "支付金额必须大于零");
        String method = upper(input.paymentMethodCode());
        String paymentScene = upper(input.paymentSceneCode());
        if ("MEDICAL_INSURANCE".equals(method)) {
            throw badRequest("PAYMENT_METHOD_CLASSIFICATION_INVALID",
                    "医保属于结算类型，不是患者支付方式；请在医保结算后选择个人自付支付方式");
        }
        if (paymentScene == null) paymentScene = "CASHIER";
        if (!dictionaryAttributeDirectory.isApplicable(context.tenantId(), context.organizationId(), context.departmentId(),
                "PAY_METHOD", method, "AVAILABLE_SCENE", paymentScene)) {
            throw badRequest("PAYMENT_METHOD_NOT_APPLICABLE", "当前支付方式不适用于所选结算场景");
        }
        if (invoice.netAmount().signum() <= 0) throw conflict("PAYMENT_CREDIT_INVOICE_INVALID", "贷项结算凭证不能执行收款");
        if (input.roundingAdjustment() != null && input.roundingAdjustment().signum() != 0) {
            Settlement formalSettlement = settlements.requireForPayment(context, invoice.id());
            formalSettlement.applyRoundingAdjustment(input.roundingAdjustment());
            invoice.adjustRounding(input.roundingAdjustment());
        }
        BigDecimal paid = money(paymentRepository.netPaidForInvoice(context.tenantId(), invoice.id()));
        BigDecimal outstanding = money(invoice.netAmount().subtract(paid));
        if (amount.compareTo(outstanding) > 0) throw conflict("PAYMENT_EXCEEDS_OUTSTANDING", "支付金额超过结算凭证未付金额");
        Instant paidAt = input.paidAt() == null ? Instant.now() : input.paidAt();
        Payment payment = paymentRepository.save(new Payment(context.tenantId(), account.id(), invoice.id(),
                input.paymentOrderId(), paymentNo, "PAYMENT", method, paymentScene, amount, account.currencyCode(), paidAt,
                clean(input.externalTransactionNo()), null, context.subjectId(), clean(input.description())));
        ledgerRepository.save(new LedgerEntry(context.tenantId(), account.id(), "PAYMENT", "CREDIT", amount,
                account.currencyCode(), null, invoice.id(), payment.id(), null, paidAt, context.subjectId()));
        settlements.recordPayment(context, invoice, payment, paid.add(amount));
        eventPublisher.publish(context.tenantId(), account.organizationId(), "BILLING_PAYMENT_COMPLETED", 1,
                "Payment", payment.id(), 1L, account.residentId(), paidAt,
                Map.of("invoiceId", invoice.id(), "paymentNo", paymentNo, "amount", amount,
                        "paymentSceneCode", paymentScene));
        return paymentView(payment);
    }

    @Transactional
    public PaymentView refundPayment(Long paymentId, RefundCommand input) {
        ExecutionContext context = requireWorkContext(); String refundNo = required(input.refundNo(),
                "REFUND_NO_REQUIRED", "退款编码不能为空");
        Payment existing = paymentRepository.findByTenantIdAndPaymentNo(context.tenantId(), refundNo).orElse(null);
        if (existing != null) return verifyRefund(context, existing, paymentId, input);
        Payment original = requirePayment(context, paymentId);
        if (!"PAYMENT".equals(original.paymentType())) throw conflict("REFUND_ORIGINAL_PAYMENT_INVALID", "只能对原始支付执行退款");
        PatientAccount account = lockAccount(context, original.patientAccountId());
        existing = paymentRepository.findByTenantIdAndPaymentNo(context.tenantId(), refundNo).orElse(null);
        if (existing != null) return verifyRefund(context, existing, paymentId, input);
        BigDecimal amount = positiveMoney(input.amount(), "REFUND_AMOUNT_INVALID", "退款金额必须大于零");
        BigDecimal refunded = money(paymentRepository.refundedForPayment(context.tenantId(), original.id()));
        if (amount.compareTo(original.amount().subtract(refunded)) > 0) {
            throw conflict("REFUND_EXCEEDS_PAYMENT", "累计退款金额超过原支付金额");
        }
        BigDecimal accountBalance = money(ledgerRepository.balance(context.tenantId(), account.id()));
        BigDecimal refundableCredit = accountBalance.signum() < 0 ? accountBalance.abs() : BigDecimal.ZERO;
        if (amount.compareTo(refundableCredit) > 0) throw conflict(
                "REFUND_EXCEEDS_ACCOUNT_CREDIT", "退款金额超过退药等反向收费形成的可退余额");
        Instant paidAt = input.refundedAt() == null ? Instant.now() : input.refundedAt();
        Payment refund = paymentRepository.save(new Payment(context.tenantId(), account.id(), original.invoiceId(),
                input.paymentOrderId(), refundNo, "REFUND", original.paymentMethodCode(),
                input.paymentSceneCode() == null ? original.paymentSceneCode() : upper(input.paymentSceneCode()),
                amount, account.currencyCode(), paidAt, clean(input.externalTransactionNo()), original.id(),
                context.subjectId(), clean(input.reason())));
        Long originalLedgerId = ledgerRepository.findByTenantIdAndPaymentId(context.tenantId(), original.id())
                .map(LedgerEntry::id).orElseThrow(() -> conflict("PAYMENT_LEDGER_MISSING", "原支付缺少可冲正账务分录"));
        ledgerRepository.save(new LedgerEntry(context.tenantId(), account.id(), "PAYMENT_REFUND", "DEBIT", amount,
                account.currencyCode(), null, original.invoiceId(), refund.id(), originalLedgerId,
                paidAt, context.subjectId()));
        eventPublisher.publish(context.tenantId(), account.organizationId(), "BILLING_PAYMENT_REFUNDED", 1,
                "Payment", refund.id(), 1L, account.residentId(), paidAt,
                Map.of("originalPaymentId", original.id(), "refundNo", refundNo, "amount", amount));
        return paymentView(refund);
    }

    @Transactional(readOnly = true)
    public DailyReconciliationView dailyReconciliation(LocalDate businessDate) {
        ExecutionContext context = requireWorkContext(); LocalDate date = businessDate == null ? LocalDate.now() : businessDate;
        Instant from = date.atStartOfDay().toInstant(ZoneOffset.UTC); Instant to = date.plusDays(1).atStartOfDay().toInstant(ZoneOffset.UTC);
        List<DispenseBillingFact> events = dispenseDirectory.findOccurredBetween(
                context.tenantId(), context.organizationId(), from, to);
        List<PatientAccount> accounts = accountRepository.findByTenantIdAndOrganizationId(
                context.tenantId(), context.organizationId());
        List<Long> accountIds = accounts.stream().map(PatientAccount::id).toList();
        List<ChargeItem> dailyCharges = accountIds.isEmpty() ? List.of()
                : chargeRepository.findDaily(context.tenantId(), accountIds, from, to);
        List<Payment> dailyPayments = accountIds.isEmpty() ? List.of()
                : paymentRepository.findDaily(context.tenantId(), accountIds, from, to);
        List<LedgerEntry> dailyLedger = accountIds.isEmpty() ? List.of()
                : ledgerRepository.findDaily(context.tenantId(), accountIds, from, to);
        List<ReconciliationLineView> lines = new ArrayList<>(); int matched = 0;
        Set<Long> matchedChargeIds = new HashSet<>();
        for (DispenseBillingFact event : events) {
            String type = sourceType(event);
            ChargeItem charge = chargeForDispenseFact(context, event);
            if (charge != null) matchedChargeIds.add(charge.id());
            BigDecimal expectedQuantity = "MEDICATION_RETURN".equals(type)
                    ? event.operationQuantity().negate() : event.operationQuantity();
            BigDecimal expectedAmount = expectedAmount(context, event, charge);
            String status; String description;
            if (charge == null) { status = "UNCHARGED"; description = "发退药事实尚未形成收费事项"; }
            else if (expectedQuantity.compareTo(charge.quantity()) != 0
                    || expectedAmount.compareTo(charge.totalAmount()) != 0) {
                status = "MISMATCH"; description = "发退药数量或金额与收费事项不一致";
            } else { status = "MATCHED"; description = "库存与收费来源逐笔一致"; matched++; }
            lines.add(new ReconciliationLineView(event.id(), type, event.dispenseNo(), event.encounterId(),
                    charge == null ? null : charge.patientAccountId(), charge == null ? null : charge.id(),
                    expectedQuantity, charge == null ? null : charge.quantity(), expectedAmount,
                    charge == null ? null : charge.totalAmount(), status, description));
        }
        for (ChargeItem charge : dailyCharges) if (isDispenseExecutionCharge(charge)
                && !matchedChargeIds.contains(charge.id())) {
            lines.add(new ReconciliationLineView(charge.sourceId(), charge.sourceType(), null, charge.encounterId(),
                    charge.patientAccountId(), charge.id(), null, charge.quantity(), null, charge.totalAmount(),
                    "ORPHAN_CHARGE", "收费事项缺少同日对应发退药事实"));
        }
        BigDecimal chargeAmount = money(dailyCharges.stream().map(ChargeItem::totalAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add));
        BigDecimal payments = money(dailyPayments.stream().filter(value -> "PAYMENT".equals(value.paymentType()))
                .map(Payment::amount).reduce(BigDecimal.ZERO, BigDecimal::add));
        BigDecimal refunds = money(dailyPayments.stream().filter(value -> "REFUND".equals(value.paymentType()))
                .map(Payment::amount).reduce(BigDecimal.ZERO, BigDecimal::add));
        BigDecimal debit = money(dailyLedger.stream().filter(value -> "DEBIT".equals(value.direction()))
                .map(LedgerEntry::amount).reduce(BigDecimal.ZERO, BigDecimal::add));
        BigDecimal credit = money(dailyLedger.stream().filter(value -> "CREDIT".equals(value.direction()))
                .map(LedgerEntry::amount).reduce(BigDecimal.ZERO, BigDecimal::add));
        String currency = accounts.stream().map(PatientAccount::currencyCode).distinct().findFirst().orElse("CNY");
        return new DailyReconciliationView(date, context.organizationId(), currency, events.size(), matched,
                lines.size() - matched, chargeAmount, payments, refunds, debit, credit,
                money(debit.subtract(credit)), lines);
    }

    private BigDecimal expectedAmount(ExecutionContext context, DispenseBillingFact event, ChargeItem current) {
        if ("RETURN".equals(event.dispenseType())) {
            ChargeItem original = requireOriginalCharge(context, event);
            return returnAmount(context, original, event.operationQuantity(), current == null ? null : current.id())
                    .negate();
        }
        return pricing(context, event).amount();
    }

    private ChargeItem chargeForDispenseFact(ExecutionContext context, DispenseBillingFact event) {
        String type = sourceType(event);
        return chargeRepository.findByTenantIdAndSourceTypeAndSourceId(context.tenantId(), type, event.id())
                .or(() -> "MEDICATION_DISPENSE".equals(type) && event.requestId() != null
                        ? chargeRepository.findByTenantIdAndSourceTypeAndSourceId(
                                context.tenantId(), "MEDICATION_REQUEST", event.requestId())
                        : java.util.Optional.empty())
                .orElse(null);
    }

    private boolean isDispenseExecutionCharge(ChargeItem charge) {
        return "MEDICATION_DISPENSE".equals(charge.sourceType())
                || "MEDICATION_RETURN".equals(charge.sourceType());
    }

    private ChargeCategory chargeCategory(ChargeItem charge) {
        if (charge.sourceType().startsWith("REGISTRATION")) return new ChargeCategory("REGISTRATION", "挂号费");
        if (charge.sourceType().startsWith("INPATIENT_BED_DAY")) return new ChargeCategory("BED", "床位费");
        if (charge.sourceType().startsWith("MEDICATION_")) return new ChargeCategory("MEDICATION", "药品费");
        if (charge.sourceType().startsWith("SERVICE_REQUEST")) return new ChargeCategory("TREATMENT", "诊疗费");
        return new ChargeCategory("OTHER", "其他费");
    }

    private ChargePricing reversalPricing(ExecutionContext context, DispenseBillingFact event, ChargeItem original) {
        return new ChargePricing(event.requestId(), original.catalogItemId(), original.priceId(),
                original.priceRevision(), original.priceType(), original.unitPrice(),
                returnAmount(context, original, event.operationQuantity(), null), original.currencyCode(),
                event.baseQuantityFactor(), original.itemCodeSnapshot(), original.itemNameSnapshot());
    }

    private ChargePricing pricing(ExecutionContext context, DispenseBillingFact event) {
        MedicationRequestSnapshot request = medicationRequestDirectory.requireForPharmacy(event.requestId());
        if (request.selfProvided()) throw conflict("SELF_PROVIDED_MEDICATION_NOT_CHARGEABLE", "自备药不能形成药房收费事项");
        if (request.totalAmount() != null && request.quantity() != null && request.quantity().signum() > 0
                && Objects.equals(request.catalogItemId(), event.catalogItemId())) {
            BigDecimal amount = money(request.totalAmount().multiply(event.operationQuantity())
                    .divide(request.quantity(), 12, RoundingMode.HALF_UP));
            BigDecimal rate = event.operationQuantity().signum() == 0 ? BigDecimal.ZERO
                    : money(amount.divide(event.operationQuantity(), 12, RoundingMode.HALF_UP));
            return new ChargePricing(event.requestId(), event.catalogItemId(), request.priceId(),
                    request.priceRevision(), request.priceType(), rate, amount,
                    requiredCurrency(request.currencyCode()), event.baseQuantityFactor(),
                    event.productCodeSnapshot(), event.productNameSnapshot());
        }
        CatalogOperationalSnapshot catalog = catalogDirectory.resolve(context.tenantId(), event.catalogItemId(),
                event.siteOrganizationId(), event.packageId(), "SALE",
                event.occurredAt().atZone(ZoneOffset.UTC).toLocalDate());
        if (catalog.item() == null || !catalog.item().chargeable() || catalog.adoption() == null
                || !catalog.adoption().chargeable()) throw conflict(
                "BILLING_CATALOG_ITEM_NOT_CHARGEABLE", "实际发放的药品产品未开放收费能力");
        if (catalog.price() == null) throw conflict("BILLING_PRICE_NOT_CONFIGURED", "实际发放产品缺少有效价格");
        BigDecimal rate = catalog.price().packageId() == null
                ? catalog.price().price().multiply(event.baseQuantityFactor()) : catalog.price().price();
        rate = money(rate); BigDecimal amount = money(rate.multiply(event.operationQuantity()));
        return new ChargePricing(event.requestId(), event.catalogItemId(), catalog.price().id(),
                catalog.price().revision(), catalog.price().sdPriceType(), rate, amount,
                requiredCurrency(catalog.price().currencyCode()), event.baseQuantityFactor(),
                event.productCodeSnapshot(), event.productNameSnapshot());
    }

    private BigDecimal returnAmount(ExecutionContext context, ChargeItem original, BigDecimal quantity,
                                    Long currentChargeId) {
        List<ChargeItem> previous = chargeRepository.findByTenantIdAndReversesChargeItemIdOrderByOccurredAtAscIdAsc(
                context.tenantId(), original.id());
        BigDecimal returnedQuantity = BigDecimal.ZERO;
        BigDecimal returnedAmount = BigDecimal.ZERO;
        for (ChargeItem value : previous) {
            if (currentChargeId != null && currentChargeId.equals(value.id())) break;
            returnedQuantity = returnedQuantity.add(value.quantity().abs());
            returnedAmount = returnedAmount.add(value.totalAmount().abs());
        }
        BigDecimal remainingQuantity = original.quantity().subtract(returnedQuantity);
        if (quantity.compareTo(remainingQuantity) > 0) throw conflict(
                "CHARGE_REVERSAL_EXCEEDS_ORIGINAL", "累计反向收费数量超过原收费事项");
        if (quantity.compareTo(remainingQuantity) == 0) return money(original.totalAmount().subtract(returnedAmount));
        return money(original.totalAmount().multiply(quantity)
                .divide(original.quantity(), 12, RoundingMode.HALF_UP));
    }

    private AccountStatementView statement(ExecutionContext context, PatientAccount account) {
        requireAccountAccess(context, account);
        List<ChargeItem> charges = chargeRepository
                .findByTenantIdAndPatientAccountIdOrderByOccurredAtAscIdAsc(context.tenantId(), account.id());
        List<Invoice> invoices = invoiceRepository
                .findByTenantIdAndPatientAccountIdOrderByIssuedAtAscIdAsc(context.tenantId(), account.id());
        List<Payment> payments = paymentRepository
                .findByTenantIdAndPatientAccountIdOrderByPaidAtAscIdAsc(context.tenantId(), account.id());
        List<LedgerEntry> ledger = ledgerRepository
                .findByTenantIdAndPatientAccountIdOrderByOccurredAtAscIdAsc(context.tenantId(), account.id());
        BigDecimal chargeAmount = money(charges.stream().map(ChargeItem::totalAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add));
        BigDecimal invoiced = money(invoices.stream().map(Invoice::netAmount).reduce(BigDecimal.ZERO, BigDecimal::add));
        BigDecimal uninvoiced = money(chargeRepository.findUninvoiced(context.tenantId(), account.id()).stream()
                .map(ChargeItem::totalAmount).reduce(BigDecimal.ZERO, BigDecimal::add));
        BigDecimal paymentAmount = money(payments.stream().filter(value -> "PAYMENT".equals(value.paymentType()))
                .map(Payment::amount).reduce(BigDecimal.ZERO, BigDecimal::add));
        BigDecimal refundAmount = money(payments.stream().filter(value -> "REFUND".equals(value.paymentType()))
                .map(Payment::amount).reduce(BigDecimal.ZERO, BigDecimal::add));
        return new AccountStatementView(account.id(), account.revision(), account.residentId(), account.encounterId(),
                account.organizationId(), account.departmentId(), account.accountType(), account.currencyCode(),
                account.status(), account.openedAt(), chargeAmount, invoiced, uninvoiced, paymentAmount, refundAmount,
                money(ledgerRepository.balance(context.tenantId(), account.id())),
                charges.stream().map(this::chargeView).toList(),
                invoices.stream().map(value -> invoiceView(context, value)).toList(),
                settlements.listByAccount(context, account.id()),
                payments.stream().map(this::paymentView).toList(), ledger.stream().map(this::ledgerView).toList());
    }

    private InvoiceView invoiceView(ExecutionContext context, Invoice invoice) {
        List<InvoiceLineView> lines = invoiceLineRepository.findByTenantIdAndInvoiceIdOrderByLineNo(
                        context.tenantId(), invoice.id()).stream()
                .map(value -> new InvoiceLineView(value.id(), value.chargeItemId(), value.lineNo(), value.amount())).toList();
        BigDecimal tendered = settlements.tenderedForInvoice(context, invoice.id());
        BigDecimal paid = tendered == null
                ? money(paymentRepository.netPaidForInvoice(context.tenantId(), invoice.id())) : tendered;
        return new InvoiceView(invoice.id(), invoice.patientAccountId(), invoice.invoiceNo(), invoice.invoiceType(),
                invoice.status(), invoice.currencyCode(), invoice.grossAmount(), invoice.discountAmount(),
                invoice.netAmount(), paid, money(invoice.netAmount().subtract(paid)), invoice.issuedAt(),
                invoice.issuedBy(), lines);
    }

    private ChargeItemView chargeView(ChargeItem value) {
        String packageSpec = null;
        String manufacturerName = null;
        String unitName = null;
        if (value.sourceType() != null && value.sourceType().startsWith("MEDICATION")
                && (value.requestId() != null || value.sourceId() != null)) {
            Long reqId = value.requestId() != null ? value.requestId() : value.sourceId();
            try {
                MedicationRequestSnapshot snap = medicationRequestDirectory.requireForRouting(value.tenantId(), reqId);
                if (snap != null) {
                    packageSpec = snap.packageSpec();
                    manufacturerName = snap.manufacturerName();
                    unitName = snap.packageUnitName();
                }
            } catch (Exception ignored) {}
        }
        return new ChargeItemView(value.id(), value.patientAccountId(), value.residentId(), value.encounterId(),
                value.requestId(), value.catalogItemId(), value.sourceType(), value.sourceId(), value.requestCode(),
                value.status(), value.quantity(), value.unitCode(), value.unitPrice(), value.totalAmount(),
                value.currencyCode(), value.priceId(), value.priceRevision(), value.priceType(),
                value.itemCodeSnapshot(), value.itemNameSnapshot(), value.occurredAt(), value.enteredBy(),
                value.reversesChargeItemId(), packageSpec, manufacturerName, unitName);
    }

    private PaymentView paymentView(Payment value) {
        return new PaymentView(value.id(), value.patientAccountId(), value.invoiceId(), value.paymentOrderId(), value.paymentNo(),
                value.paymentType(), value.paymentMethodCode(), value.paymentSceneCode(), value.status(), value.amount(), value.currencyCode(),
                value.paidAt(), value.externalTransactionNo(), value.reversesPaymentId(), value.enteredBy(),
                value.description());
    }

    private LedgerEntryView ledgerView(LedgerEntry value) {
        return new LedgerEntryView(value.id(), value.patientAccountId(), value.entryType(), value.direction(),
                value.amount(), value.currencyCode(), value.chargeItemId(), value.invoiceId(), value.paymentId(),
                value.claimResponseId(), value.reversesLedgerEntryId(), value.occurredAt(), value.recordedAt(), value.recordedBy());
    }

    private InvoiceView verifyInvoice(ExecutionContext context, Invoice value, Long accountId) {
        if (!value.patientAccountId().equals(accountId)) throw conflict("INVOICE_NO_REUSED", "结算凭证编码已被其他账户使用");
        requireAccount(context, accountId); return invoiceView(context, value);
    }

    private PaymentView verifyPayment(ExecutionContext context, Payment value, Long invoiceId, PaymentCommand input) {
        requireAccount(context, value.patientAccountId());
        if (!"PAYMENT".equals(value.paymentType()) || !Objects.equals(value.invoiceId(), invoiceId)
                || value.amount().compareTo(input.amount()) != 0
                || !value.paymentMethodCode().equals(upper(input.paymentMethodCode()))
                || !Objects.equals(value.paymentOrderId(), input.paymentOrderId())
                || !Objects.equals(value.externalTransactionNo(), clean(input.externalTransactionNo()))) {
            throw conflict("PAYMENT_NO_REUSED", "支付编码已被不同支付内容使用");
        }
        return paymentView(value);
    }

    private PaymentView verifyRefund(ExecutionContext context, Payment value, Long paymentId, RefundCommand input) {
        requireAccount(context, value.patientAccountId());
        if (!"REFUND".equals(value.paymentType()) || !Objects.equals(value.reversesPaymentId(), paymentId)
                || value.amount().compareTo(input.amount()) != 0
                || !Objects.equals(value.paymentOrderId(), input.paymentOrderId())
                || !Objects.equals(value.externalTransactionNo(), clean(input.externalTransactionNo()))) {
            throw conflict("REFUND_NO_REUSED", "退款编码已被不同退款内容使用");
        }
        return paymentView(value);
    }

    private PatientAccount findOrCreateAccount(ExecutionContext context, EncounterSnapshot encounter, String currency) {
        return accountRepository.findByTenantIdAndEncounterIdAndCurrencyCode(context.tenantId(), encounter.id(), currency)
                .orElseGet(() -> accountRepository.save(new PatientAccount(context.tenantId(), encounter.residentId(),
                        encounter.id(), encounter.organizationId(), encounter.departmentId(), currency)));
    }

    private PatientAccount requireAccount(ExecutionContext context, Long id) {
        PatientAccount account = accountRepository.findByIdAndTenantId(id, context.tenantId())
                .orElseThrow(() -> notFound("PATIENT_ACCOUNT_NOT_FOUND", "未找到患者费用账户"));
        requireAccountAccess(context, account); return account;
    }

    private PatientAccount lockAccount(ExecutionContext context, Long id) {
        PatientAccount account = accountRepository.lockByIdAndTenantId(id, context.tenantId())
                .orElseThrow(() -> notFound("PATIENT_ACCOUNT_NOT_FOUND", "未找到患者费用账户"));
        requireAccountAccess(context, account); return account;
    }

    private Invoice requireInvoice(ExecutionContext context, Long id) {
        Invoice invoice = invoiceRepository.findByIdAndTenantId(id, context.tenantId())
                .orElseThrow(() -> notFound("INVOICE_NOT_FOUND", "未找到结算凭证"));
        requireAccount(context, invoice.patientAccountId()); return invoice;
    }

    private Payment requirePayment(ExecutionContext context, Long id) {
        Payment payment = paymentRepository.findByIdAndTenantId(id, context.tenantId())
                .orElseThrow(() -> notFound("PAYMENT_NOT_FOUND", "未找到支付事实"));
        requireAccount(context, payment.patientAccountId()); return payment;
    }

    private ChargeItem requireOriginalCharge(ExecutionContext context, DispenseBillingFact event) {
        if (event.originalDispenseId() == null) throw conflict("RETURN_CHARGE_ORIGINAL_MISSING", "退药事件缺少原发药关联");
        ChargeItem original = chargeRepository.findByTenantIdAndSourceTypeAndSourceId(
                        context.tenantId(), "MEDICATION_DISPENSE", event.originalDispenseId())
                .or(() -> event.requestId() == null ? java.util.Optional.empty()
                        : chargeRepository.findByTenantIdAndSourceTypeAndSourceId(
                                context.tenantId(), "MEDICATION_REQUEST", event.requestId()))
                .orElseThrow(() -> conflict("RETURN_CHARGE_ORIGINAL_NOT_POSTED", "原发药尚未计费，不能生成反向收费"));
        if (!original.encounterId().equals(event.encounterId())) throw conflict(
                "RETURN_CHARGE_ENCOUNTER_MISMATCH", "退药事实与原收费事项不属于同一就诊");
        return original;
    }

    private EncounterSnapshot requireEncounter(ExecutionContext context, Long encounterId) {
        EncounterSnapshot encounter = encounterDirectory.requireOrganizationAccessible(encounterId);
        if (!context.tenantId().equals(encounter.tenantId()) || !context.canAccessOrganization(encounter.organizationId())) {
            throw badRequest("BILLING_ENCOUNTER_SCOPE_INVALID", "当前工作上下文不能访问该就诊费用");
        }
        return encounter;
    }

    private ExecutionContext requireWorkContext() {
        ExecutionContext context = contextProvider.requireCurrent();
        if (!context.hasWorkContext()) throw badRequest("BILLING_WORK_CONTEXT_REQUIRED", "收费操作必须选择工作机构");
        return context;
    }

    private void requireAccountAccess(ExecutionContext context, PatientAccount account) {
        if (!context.canAccessOrganization(account.organizationId())) throw badRequest(
                "BILLING_ACCOUNT_SCOPE_INVALID", "当前工作上下文不能访问该费用账户");
    }

    private String sourceType(DispenseBillingFact event) {
        return "RETURN".equals(event.dispenseType()) ? "MEDICATION_RETURN" : "MEDICATION_DISPENSE";
    }

    private String requireSameCurrency(String current, String value) {
        if (current != null && !current.equals(value)) throw conflict(
                "BILLING_ENCOUNTER_MULTI_CURRENCY_UNSUPPORTED", "本轮门诊结算不允许同一就诊混用多个币种");
        return value;
    }

    private String requiredCurrency(String value) {
        String result = upper(value); if (result == null || result.length() != 3) throw conflict(
                "BILLING_CURRENCY_INVALID", "价格快照缺少有效三位币种代码"); return result;
    }

    private BigDecimal positiveMoney(BigDecimal value, String code, String message) {
        if (value == null || value.signum() <= 0) throw badRequest(code, message); return money(value);
    }

    private BigDecimal money(BigDecimal value) { return value.setScale(6, RoundingMode.HALF_UP); }
    private String required(String value, String code, String message) {
        String result = clean(value); if (result == null) throw badRequest(code, message); return result;
    }
    private String clean(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    private String upper(String value) { String result = clean(value); return result == null ? null : result.toUpperCase(); }

    private record ChargePricing(Long requestId, Long catalogItemId, Long priceId, Long priceRevision,
                                 String priceType, BigDecimal unitPrice, BigDecimal amount, String currencyCode,
                                 BigDecimal unitFactor, String itemCode, String itemName) {}
    private record ChargeCategory(String code, String name) {}

    public record SynchronizeCommand(String requestCode) {}
    public record IssueInvoiceCommand(String invoiceNo, Instant issuedAt, String settlementScene,
                                      String terminalScene, String terminalCode, List<Long> chargeItemIds) {
        public IssueInvoiceCommand(String invoiceNo, Instant issuedAt, String settlementScene,
                                   String terminalScene, String terminalCode) {
            this(invoiceNo, issuedAt, settlementScene, terminalScene, terminalCode, null);
        }
    }
    public record PaymentCommand(String paymentNo, String paymentMethodCode, String paymentSceneCode, BigDecimal amount,
                                 Instant paidAt, String externalTransactionNo, String description,
                                 Long paymentOrderId, BigDecimal roundingAdjustment) {
        public PaymentCommand(String paymentNo, String paymentMethodCode, String paymentSceneCode, BigDecimal amount,
                              Instant paidAt, String externalTransactionNo, String description,
                              Long paymentOrderId) {
            this(paymentNo, paymentMethodCode, paymentSceneCode, amount, paidAt, externalTransactionNo, description, paymentOrderId, null);
        }
    }
    public record RefundCommand(String refundNo, BigDecimal amount, Instant refundedAt,
                                String externalTransactionNo, String reason, Long paymentOrderId,
                                String paymentSceneCode) {}
}
