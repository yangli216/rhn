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
import com.rhn.billing.infrastructure.ChargeItemComponentRepository;
import com.rhn.billing.infrastructure.ChargeItemRepository;
import com.rhn.billing.infrastructure.InvoiceCategorySummaryRepository;
import com.rhn.billing.infrastructure.InvoiceLineRepository;
import com.rhn.billing.infrastructure.InvoiceRepository;
import com.rhn.billing.infrastructure.LedgerEntryRepository;
import com.rhn.billing.infrastructure.PatientAccountRepository;
import com.rhn.billing.infrastructure.PaymentRepository;
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
            EncounterDirectory encounterDirectory, MedicationRequestDirectory medicationRequestDirectory,
            CatalogLifecycleDirectory catalogDirectory, DomainEventPublisher eventPublisher,
            DictionaryAttributeDirectory dictionaryAttributeDirectory,
            ExecutionContextProvider contextProvider,
            SettlementApplicationService settlements) {
        this.accountRepository = accountRepository; this.chargeRepository = chargeRepository;
        this.componentRepository = componentRepository; this.invoiceRepository = invoiceRepository;
        this.invoiceLineRepository = invoiceLineRepository; this.categoryRepository = categoryRepository;
        this.paymentRepository = paymentRepository; this.ledgerRepository = ledgerRepository;
        this.dispenseDirectory = dispenseDirectory;
        this.encounterDirectory = encounterDirectory; this.medicationRequestDirectory = medicationRequestDirectory;
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
        Map<Long, List<DispenseBillingFact>> grouped = new LinkedHashMap<>();
        for (DispenseBillingFact event : dispenseDirectory.findWorklist(context.tenantId(), context.organizationId())) {
            grouped.computeIfAbsent(event.encounterId(), ignored -> new ArrayList<>()).add(event);
        }
        List<BillingWorkItemView> result = new ArrayList<>();
        for (Map.Entry<Long, List<DispenseBillingFact>> entry : grouped.entrySet()) {
            List<DispenseBillingFact> events = entry.getValue(); DispenseBillingFact latest = events.getFirst();
            List<ChargeItem> charges = events.stream().map(event -> chargeRepository
                            .findByTenantIdAndSourceTypeAndSourceId(context.tenantId(), sourceType(event), event.id())
                            .orElse(null)).filter(Objects::nonNull).toList();
            PatientAccount account = accountRepository.findByTenantIdAndEncounterIdAndCurrencyCode(
                    context.tenantId(), entry.getKey(), "CNY").orElse(null);
            BigDecimal chargeAmount = money(charges.stream().map(ChargeItem::totalAmount)
                    .reduce(BigDecimal.ZERO, BigDecimal::add));
            BigDecimal balance = account == null ? BigDecimal.ZERO
                    : money(ledgerRepository.balance(context.tenantId(), account.id()));
            String status;
            if (charges.size() < events.size()) status = "PENDING_CHARGE";
            else if (account != null && !chargeRepository.findUninvoiced(context.tenantId(), account.id()).isEmpty()) {
                status = "PENDING_INVOICE";
            } else if (balance.signum() > 0) status = "PENDING_PAYMENT";
            else if (balance.signum() < 0) status = "PENDING_REFUND";
            else status = "SETTLED";
            result.add(new BillingWorkItemView(entry.getKey(), latest.residentId(),
                    account == null ? null : account.id(), account == null ? null : account.currencyCode(), status,
                    events.size(), charges.size(), latest.dispenseNo(), latest.occurredAt(), chargeAmount, balance));
        }
        return result.stream().limit(100).toList();
    }

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
        categoryRepository.save(new InvoiceCategorySummary(context.tenantId(), invoice.id(),
                "MEDICATION", "药品费", total));
        settlements.createFromInvoice(context, account, invoice, charges, invoiceLines,
                input.settlementScene(), input.terminalScene(), input.terminalCode(), "MEDICATION", "药品费");
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
        if (paymentScene == null) paymentScene = "CASHIER";
        if (!dictionaryAttributeDirectory.isApplicable(context.tenantId(), context.organizationId(), context.departmentId(),
                "PAY_METHOD", method, "AVAILABLE_SCENE", paymentScene)) {
            throw badRequest("PAYMENT_METHOD_NOT_APPLICABLE", "当前支付方式不适用于所选结算场景");
        }
        if (invoice.netAmount().signum() <= 0) throw conflict("PAYMENT_CREDIT_INVOICE_INVALID", "贷项结算凭证不能执行收款");
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
        Set<Long> eventIds = new HashSet<>();
        for (DispenseBillingFact event : events) {
            eventIds.add(event.id()); String type = sourceType(event);
            ChargeItem charge = chargeRepository.findByTenantIdAndSourceTypeAndSourceId(
                    context.tenantId(), type, event.id()).orElse(null);
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
        for (ChargeItem charge : dailyCharges) if (!eventIds.contains(charge.sourceId())) {
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
        BigDecimal paid = money(paymentRepository.netPaidForInvoice(context.tenantId(), invoice.id()));
        return new InvoiceView(invoice.id(), invoice.patientAccountId(), invoice.invoiceNo(), invoice.invoiceType(),
                invoice.status(), invoice.currencyCode(), invoice.grossAmount(), invoice.discountAmount(),
                invoice.netAmount(), paid, money(invoice.netAmount().subtract(paid)), invoice.issuedAt(),
                invoice.issuedBy(), lines);
    }

    private ChargeItemView chargeView(ChargeItem value) {
        return new ChargeItemView(value.id(), value.patientAccountId(), value.residentId(), value.encounterId(),
                value.requestId(), value.catalogItemId(), value.sourceType(), value.sourceId(), value.requestCode(),
                value.status(), value.quantity(), value.unitCode(), value.unitPrice(), value.totalAmount(),
                value.currencyCode(), value.priceId(), value.priceRevision(), value.priceType(),
                value.itemCodeSnapshot(), value.itemNameSnapshot(), value.occurredAt(), value.enteredBy(),
                value.reversesChargeItemId());
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
                .orElseThrow(() -> conflict("RETURN_CHARGE_ORIGINAL_NOT_POSTED", "原发药尚未计费，不能生成反向收费"));
        if (!original.encounterId().equals(event.encounterId())) throw conflict(
                "RETURN_CHARGE_ENCOUNTER_MISMATCH", "退药事实与原收费事项不属于同一就诊");
        return original;
    }

    private EncounterSnapshot requireEncounter(ExecutionContext context, Long encounterId) {
        EncounterSnapshot encounter = encounterDirectory.requireAccessible(encounterId);
        if (!context.tenantId().equals(encounter.tenantId()) || !context.canAccessOrganization(encounter.organizationId())) {
            throw badRequest("BILLING_ENCOUNTER_SCOPE_INVALID", "当前工作上下文不能访问该就诊费用");
        }
        return encounter;
    }

    private ExecutionContext requireWorkContext() {
        ExecutionContext context = contextProvider.requireCurrent();
        if (!context.hasWorkContext()) throw badRequest("BILLING_WORK_CONTEXT_REQUIRED", "收费操作必须选择工作机构和科室");
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

    public record SynchronizeCommand(String requestCode) {}
    public record IssueInvoiceCommand(String invoiceNo, Instant issuedAt, String settlementScene,
                                      String terminalScene, String terminalCode) {}
    public record PaymentCommand(String paymentNo, String paymentMethodCode, String paymentSceneCode, BigDecimal amount,
                                 Instant paidAt, String externalTransactionNo, String description,
                                 Long paymentOrderId) {}
    public record RefundCommand(String refundNo, BigDecimal amount, Instant refundedAt,
                                String externalTransactionNo, String reason, Long paymentOrderId,
                                String paymentSceneCode) {}
}
