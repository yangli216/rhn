package com.rhn.billing.application;

import com.rhn.billing.api.RegistrationBillingViews.RegistrationIntentView;
import com.rhn.billing.domain.ChargeItem;
import com.rhn.billing.domain.ChargeItemComponent;
import com.rhn.billing.domain.Invoice;
import com.rhn.billing.domain.InvoiceCategorySummary;
import com.rhn.billing.domain.InvoiceLine;
import com.rhn.billing.domain.LedgerEntry;
import com.rhn.billing.domain.PatientAccount;
import com.rhn.billing.domain.Payment;
import com.rhn.billing.domain.RegistrationBillingIntent;
import com.rhn.billing.domain.Settlement;
import com.rhn.billing.infrastructure.ChargeItemComponentRepository;
import com.rhn.billing.infrastructure.ChargeItemRepository;
import com.rhn.billing.infrastructure.InvoiceCategorySummaryRepository;
import com.rhn.billing.infrastructure.InvoiceLineRepository;
import com.rhn.billing.infrastructure.InvoiceRepository;
import com.rhn.billing.infrastructure.LedgerEntryRepository;
import com.rhn.billing.infrastructure.PatientAccountRepository;
import com.rhn.billing.infrastructure.PaymentRepository;
import com.rhn.billing.infrastructure.RegistrationBillingIntentRepository;
import com.rhn.billing.infrastructure.SettlementRepository;
import com.rhn.healthcore.api.CoverageDirectory;
import com.rhn.outpatient.api.EncounterDirectory;
import com.rhn.outpatient.api.OutpatientScheduleDirectory;
import com.rhn.outpatient.api.OutpatientAppointmentDirectory;
import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory;
import com.rhn.platform.organization.api.OrganizationDirectory;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.List;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
class RegistrationBillingIntentTransactionService {
    private static final ZoneId BUSINESS_ZONE = ZoneId.of("Asia/Shanghai");
    private final RegistrationBillingIntentRepository intents;
    private final PatientAccountRepository accounts;
    private final PaymentRepository payments;
    private final ChargeItemRepository charges;
    private final ChargeItemComponentRepository components;
    private final LedgerEntryRepository ledger;
    private final InvoiceRepository invoices;
    private final InvoiceLineRepository invoiceLines;
    private final InvoiceCategorySummaryRepository invoiceCategories;
    private final SettlementApplicationService settlements;
    private final SettlementRepository settlementRepository;
    private final OutpatientScheduleDirectory schedules;
    private final OutpatientAppointmentDirectory appointments;
    private final CatalogLifecycleDirectory catalog;
    private final EncounterDirectory encounters;
    private final CoverageDirectory coverages;
    private final OrganizationDirectory organizations;
    private final ExecutionContextProvider contextProvider;

    RegistrationBillingIntentTransactionService(RegistrationBillingIntentRepository intents,
            PatientAccountRepository accounts, PaymentRepository payments, ChargeItemRepository charges,
            ChargeItemComponentRepository components, LedgerEntryRepository ledger,
            InvoiceRepository invoices, InvoiceLineRepository invoiceLines,
            InvoiceCategorySummaryRepository invoiceCategories, SettlementApplicationService settlements,
            SettlementRepository settlementRepository,
            OutpatientScheduleDirectory schedules, OutpatientAppointmentDirectory appointments,
            CatalogLifecycleDirectory catalog,
            EncounterDirectory encounters, CoverageDirectory coverages, OrganizationDirectory organizations,
            ExecutionContextProvider contextProvider) {
        this.intents = intents; this.accounts = accounts; this.payments = payments;
        this.charges = charges; this.components = components;
        this.ledger = ledger; this.invoices = invoices; this.invoiceLines = invoiceLines;
        this.invoiceCategories = invoiceCategories; this.settlements = settlements;
        this.settlementRepository = settlementRepository; this.schedules = schedules;
        this.appointments = appointments;
        this.catalog = catalog; this.encounters = encounters; this.coverages = coverages;
        this.organizations = organizations;
        this.contextProvider = contextProvider;
    }

    @Transactional
    CreateResult create(CreateCommand input) {
        ExecutionContext context = requireOrganizationContext(input.organizationId());
        String code = required(input.idempotencyCode(), "REGISTRATION_INTENT_IDEMPOTENCY_REQUIRED", "挂号意向必须提供幂等编码");
        String source = normalizeSource(input.registrationSource(), input.scheduleId() != null || input.appointmentId() != null);
        String visitType = normalizeVisit(input.visitType());
        String settlementMode = normalizeSettlementMode(input.settlementMode());
        Long coverageId = normalizeCoverageId(settlementMode, input.coverageId());
        RegistrationBillingIntent replay = intents.findByTenantIdAndIdempotencyCode(context.tenantId(), code).orElse(null);
        if (replay != null) return replay(input, source, visitType, settlementMode, coverageId, replay);
        encounters.validateRegistration(new EncounterDirectory.RegistrationEligibilityCommand(
                input.residentId(), input.organizationId(), input.departmentId()));
        replay = intents.findByTenantIdAndIdempotencyCode(context.tenantId(), code).orElse(null);
        if (replay != null) return replay(input, source, visitType, settlementMode, coverageId, replay);
        organizations.requireDepartment(context.tenantId(), input.organizationId(), input.departmentId());
        CoverageDirectory.CoverageView coverage = coverageId == null ? null
                : coverages.requireActive(coverageId, input.residentId(), LocalDate.now(BUSINESS_ZONE));

        Long scheduleId = input.scheduleId();
        Long appointmentId = input.appointmentId();
        Long catalogItemId = null;
        Long holdId = null;
        String itemCode = null;
        String itemName = null;
        BigDecimal amount = zero();
        String currency = "CNY";
        Instant expiresAt = null;
        if (appointmentId != null) {
            var booking = appointments.prepareRegistration(appointmentId, input.residentId(),
                    input.organizationId(), input.departmentId());
            if (scheduleId != null && !scheduleId.equals(booking.scheduleId())) {
                throw badRequest("REGISTRATION_APPOINTMENT_SCHEDULE_MISMATCH", "预约与挂号班次不一致");
            }
            var active = intents.findFirstByTenantIdAndAppointmentIdAndStatusIn(context.tenantId(), appointmentId,
                    List.of("PAYMENT_PENDING", "PAID", "COMPLETING", "COMPLETION_FAILED"));
            if (active.isPresent()) {
                throw conflict("REGISTRATION_APPOINTMENT_INTENT_ACTIVE", "该预约已有进行中的挂号办理，请继续原流程");
            }
            scheduleId = booking.scheduleId();
            catalogItemId = booking.catalogItemId();
            itemCode = booking.serviceCode();
            itemName = booking.serviceName();
            expiresAt = Instant.now().plus(15, ChronoUnit.MINUTES);
            var resolved = catalog.resolve(context.tenantId(), catalogItemId, input.organizationId(), null,
                    "SALE", LocalDate.now(BUSINESS_ZONE));
            if (resolved.item().chargeable()) {
                if (resolved.price() == null) {
                    throw conflict("REGISTRATION_PRICE_MISSING", "所选门诊服务尚未配置当前有效挂号价格");
                }
                amount = money(resolved.price().price());
                currency = resolved.price().currencyCode();
            }
        } else if (scheduleId != null) {
            expiresAt = Instant.now().plus(15, ChronoUnit.MINUTES);
            var hold = schedules.reserve(new OutpatientScheduleDirectory.SlotHoldCommand(input.residentId(),
                    input.organizationId(), input.departmentId(), scheduleId, "REG-HOLD-" + code, expiresAt));
            holdId = hold.id(); catalogItemId = hold.catalogItemId(); itemCode = hold.serviceCode(); itemName = hold.serviceName();
            expiresAt = hold.expiresAt();
            var resolved = catalog.resolve(context.tenantId(), catalogItemId, input.organizationId(), null,
                    "SALE", LocalDate.now(BUSINESS_ZONE));
            if (resolved.item().chargeable()) {
                if (resolved.price() == null) {
                    throw conflict("REGISTRATION_PRICE_MISSING", "所选门诊服务尚未配置当前有效挂号价格");
                }
                amount = money(resolved.price().price());
                currency = resolved.price().currencyCode();
            }
        }

        RegistrationBillingIntent intent = new RegistrationBillingIntent(context.tenantId(), input.residentId(),
                input.organizationId(), input.departmentId(), appointmentId, scheduleId, catalogItemId, holdId, code,
                source, visitType, settlementMode, coverageId,
                coverage == null ? null : coverage.coverageTypeCode(), coverage == null ? null : coverage.payerName(),
                amount, currency, itemCode, itemName, expiresAt, context.subjectId());
        if (amount.signum() > 0) createFinancialFacts(context, intent, amount, currency);
        intents.save(intent);
        return new CreateResult(view(intent, false), amount.signum() == 0);
    }

    private void createFinancialFacts(ExecutionContext context, RegistrationBillingIntent intent,
                                      BigDecimal amount, String currency) {
        PatientAccount account = accounts.save(PatientAccount.registration(context.tenantId(), intent.residentId(),
                intent.organizationId(), intent.departmentId(), currency));
        Instant now = Instant.now();
        var resolved = catalog.resolve(context.tenantId(), intent.catalogItemId(), intent.organizationId(), null,
                "SALE", LocalDate.now(BUSINESS_ZONE));
        ChargeItem charge = charges.save(new ChargeItem(context.tenantId(), account.id(), intent.residentId(), null,
                null, intent.catalogItemId(), "REGISTRATION", intent.id(), "REG-" + intent.id(), BigDecimal.ONE,
                resolved.item().unitCode(), amount, amount, currency, resolved.price().id(),
                resolved.price().revision(), resolved.price().sdPriceType(), intent.itemCode(), intent.itemName(),
                now, context.subjectId(), null));
        components.save(new ChargeItemComponent(context.tenantId(), charge.id(), intent.catalogItemId(),
                intent.itemCode(), intent.itemName(), BigDecimal.ONE, resolved.item().unitCode(), BigDecimal.ONE,
                amount, amount));
        ledger.save(new LedgerEntry(context.tenantId(), account.id(), "CHARGE", "DEBIT", amount, currency,
                charge.id(), null, null, null, now, context.subjectId()));
        Invoice invoice = invoices.save(new Invoice(context.tenantId(), account.id(), "RGI" + intent.id(),
                currency, amount, now, context.subjectId()));
        InvoiceLine line = invoiceLines.save(new InvoiceLine(context.tenantId(), invoice.id(), charge.id(), 1, amount));
        invoiceCategories.save(new InvoiceCategorySummary(context.tenantId(), invoice.id(),
                "REGISTRATION", "挂号费", amount));
        Settlement settlement = settlements.createFromInvoice(context, account, invoice, List.of(charge), List.of(line),
                "REGISTRATION", "CASHIER", null);
        intent.attachFinancials(account.id(), settlement.id());
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    CompletionPlan beginBySettlement(Long settlementId, Long paymentOrderId, Long accountId) {
        ExecutionContext context = contextProvider.requireCurrent();
        RegistrationBillingIntent value = intents.findByTenantIdAndSettlementId(context.tenantId(), settlementId)
                .orElseThrow(() -> notFound("REGISTRATION_INTENT_NOT_FOUND", "未找到支付对应的挂号意向"));
        var settlement = settlementRepository.findByIdAndTenantId(settlementId, context.tenantId())
                .orElseThrow(() -> notFound("SETTLEMENT_NOT_FOUND", "未找到挂号正式结算单"));
        if (!"SETTLED".equals(settlement.status())) {
            throw conflict("REGISTRATION_PAYMENT_INCOMPLETE", "挂号费尚未足额结清，不能生成挂号记录");
        }
        return beginLocked(value.id(), paymentOrderId, accountId);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    void linkPaymentOrder(Long settlementId, Long paymentOrderId, Long accountId) {
        ExecutionContext context = contextProvider.requireCurrent();
        RegistrationBillingIntent probe = intents.findByTenantIdAndSettlementId(context.tenantId(), settlementId)
                .orElseThrow(() -> notFound("REGISTRATION_INTENT_NOT_FOUND", "未找到支付对应的挂号意向"));
        RegistrationBillingIntent value = intents.lockByIdAndTenantId(probe.id(), context.tenantId()).orElseThrow();
        if (!accountId.equals(value.patientAccountId())) {
            throw conflict("REGISTRATION_PAYMENT_ACCOUNT_MISMATCH", "支付账户与挂号意向不一致");
        }
        value.linkPaymentOrder(paymentOrderId);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    CompletionPlan beginById(Long intentId, Long paymentOrderId) {
        ExecutionContext context = contextProvider.requireCurrent();
        return beginLocked(intentId, paymentOrderId, null);
    }

    private CompletionPlan beginLocked(Long intentId, Long paymentOrderId, Long expectedAccountId) {
        ExecutionContext context = contextProvider.requireCurrent();
        RegistrationBillingIntent value = intents.lockByIdAndTenantId(intentId, context.tenantId())
                .orElseThrow(() -> notFound("REGISTRATION_INTENT_NOT_FOUND", "未找到挂号收费意向"));
        if (expectedAccountId != null && !expectedAccountId.equals(value.patientAccountId())) {
            throw conflict("REGISTRATION_PAYMENT_ACCOUNT_MISMATCH", "支付账户与挂号意向不一致");
        }
        if ("COMPLETED".equals(value.status())) return plan(value, false);
        if (value.expiresAt() != null && !value.expiresAt().isAfter(Instant.now())
                && value.paymentOrderId() == null && paymentOrderId == null) {
            throw conflict("REGISTRATION_INTENT_EXPIRED", "挂号意向已经过期");
        }
        if (!value.beginCompletion(paymentOrderId)) {
            throw conflict("REGISTRATION_INTENT_NOT_COMPLETABLE", "当前挂号意向状态不允许完成");
        }
        return plan(value, true);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    void markCompleted(Long intentId, Long encounterId) {
        ExecutionContext context = contextProvider.requireCurrent();
        RegistrationBillingIntent value = intents.lockByIdAndTenantId(intentId, context.tenantId())
                .orElseThrow(() -> notFound("REGISTRATION_INTENT_NOT_FOUND", "未找到挂号收费意向"));
        if (value.patientAccountId() != null) {
            PatientAccount account = accounts.lockByIdAndTenantId(value.patientAccountId(), context.tenantId())
                    .orElseThrow(() -> notFound("PATIENT_ACCOUNT_NOT_FOUND", "未找到挂号对应的患者费用账户"));
            account.bindEncounter(encounterId);
            charges.findByTenantIdAndPatientAccountIdOrderByOccurredAtAscIdAsc(context.tenantId(), account.id())
                    .forEach(charge -> charge.bindEncounter(encounterId));
        }
        value.completed(encounterId);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    void markFailed(Long intentId, String code, String message) {
        ExecutionContext context = contextProvider.requireCurrent();
        RegistrationBillingIntent value = intents.lockByIdAndTenantId(intentId, context.tenantId())
                .orElseThrow(() -> notFound("REGISTRATION_INTENT_NOT_FOUND", "未找到挂号收费意向"));
        value.failed(code, truncate(message, 2000));
    }

    @Transactional
    CancellationPlan prepareCancellation(Long encounterId) {
        ExecutionContext context = contextProvider.requireCurrent();
        RegistrationBillingIntent value = intents.lockByTenantIdAndEncounterId(context.tenantId(), encounterId)
                .orElse(null);
        if (value == null) return CancellationPlan.notApplicable();
        requireOrganizationContext(value.organizationId());
        if ("CANCELLED".equals(value.status())) {
            return new CancellationPlan(value.id(), value.status(), value.feeAmount(), value.currencyCode(),
                    null, true);
        }
        value.beginCancellation();
        if (value.feeAmount().signum() == 0) {
            value.cancelledAfterCompletion();
            return new CancellationPlan(value.id(), value.status(), value.feeAmount(), value.currencyCode(),
                    null, true);
        }
        ChargeItem original = charges.findByTenantIdAndSourceTypeAndSourceId(
                        context.tenantId(), "REGISTRATION", value.id())
                .orElseThrow(() -> notFound("REGISTRATION_CHARGE_NOT_FOUND", "未找到挂号费收费事项"));
        if (charges.findByTenantIdAndSourceTypeAndSourceId(
                context.tenantId(), "REGISTRATION_REVERSAL", value.id()).isEmpty()) {
            Instant now = Instant.now();
            BigDecimal amount = original.totalAmount().abs().setScale(6, RoundingMode.HALF_UP);
            ChargeItem reversal = charges.save(new ChargeItem(context.tenantId(), original.patientAccountId(),
                    original.residentId(), encounterId, original.requestId(), original.catalogItemId(),
                    "REGISTRATION_REVERSAL", value.id(), "REG-REV-" + value.id(),
                    original.quantity().abs().negate(), original.unitCode(), original.unitPrice(), amount.negate(),
                    original.currencyCode(), original.priceId(), original.priceRevision(), original.priceType(),
                    original.itemCodeSnapshot(), original.itemNameSnapshot(), now, context.subjectId(), original.id()));
            components.save(new ChargeItemComponent(context.tenantId(), reversal.id(), original.catalogItemId(),
                    original.itemCodeSnapshot(), original.itemNameSnapshot(), original.quantity().abs().negate(),
                    original.unitCode(), BigDecimal.ONE, original.unitPrice(), amount.negate()));
            Long reversesLedger = ledger.findByTenantIdAndChargeItemId(context.tenantId(), original.id())
                    .map(LedgerEntry::id).orElse(null);
            ledger.save(new LedgerEntry(context.tenantId(), original.patientAccountId(), "CHARGE_REVERSAL", "CREDIT",
                    amount, original.currencyCode(), reversal.id(), null, null, reversesLedger,
                    now, context.subjectId()));
        }
        Payment payment = payments.findByTenantIdAndPaymentOrderId(context.tenantId(), value.paymentOrderId())
                .orElseThrow(() -> notFound("REGISTRATION_PAYMENT_NOT_FOUND", "未找到挂号费原支付事实"));
        return new CancellationPlan(value.id(), value.status(), value.feeAmount(), value.currencyCode(),
                payment.id(), false);
    }

    @Transactional
    void markCancellationCompleted(Long intentId) {
        ExecutionContext context = contextProvider.requireCurrent();
        RegistrationBillingIntent value = intents.lockByIdAndTenantId(intentId, context.tenantId())
                .orElseThrow(() -> notFound("REGISTRATION_INTENT_NOT_FOUND", "未找到挂号收费意向"));
        value.cancelledAfterCompletion();
    }

    @Transactional
    void markCancellationFailed(Long intentId, String code, String message) {
        ExecutionContext context = contextProvider.requireCurrent();
        RegistrationBillingIntent value = intents.lockByIdAndTenantId(intentId, context.tenantId())
                .orElseThrow(() -> notFound("REGISTRATION_INTENT_NOT_FOUND", "未找到挂号收费意向"));
        value.cancellationFailed(code, truncate(message, 2000));
    }

    @Transactional
    RegistrationIntentView cancel(Long intentId) {
        ExecutionContext context = contextProvider.requireCurrent();
        RegistrationBillingIntent value = intents.lockByIdAndTenantId(intentId, context.tenantId())
                .orElseThrow(() -> notFound("REGISTRATION_INTENT_NOT_FOUND", "未找到挂号收费意向"));
        requireOrganizationContext(value.organizationId());
        value.cancel();
        if (value.slotHoldId() != null) {
            schedules.release(value.slotHoldId(), "CANCEL-REG-INTENT-" + value.id(), false);
        }
        return view(value, false);
    }

    @Transactional(readOnly = true)
    RegistrationIntentView get(Long intentId) {
        return get(intentId, false);
    }

    @Transactional(readOnly = true)
    RegistrationIntentView get(Long intentId, boolean duplicate) {
        ExecutionContext context = contextProvider.requireCurrent();
        RegistrationBillingIntent value = intents.findByIdAndTenantId(intentId, context.tenantId())
                .orElseThrow(() -> notFound("REGISTRATION_INTENT_NOT_FOUND", "未找到挂号收费意向"));
        requireOrganizationContext(value.organizationId());
        return view(value, duplicate);
    }

    private CreateResult replay(CreateCommand input, String source, String visitType, String settlementMode,
                                Long coverageId,
                                RegistrationBillingIntent value) {
        if (!value.residentId().equals(input.residentId())
                || !value.organizationId().equals(input.organizationId())
                || !value.departmentId().equals(input.departmentId())
                || !java.util.Objects.equals(value.appointmentId(), input.appointmentId())
                || (input.appointmentId() == null && !java.util.Objects.equals(value.scheduleId(), input.scheduleId()))
                || (input.appointmentId() != null && input.scheduleId() != null
                    && !java.util.Objects.equals(value.scheduleId(), input.scheduleId()))
                || !value.registrationSource().equals(source) || !value.visitType().equals(visitType)
                || !value.settlementMode().equals(settlementMode)
                || !java.util.Objects.equals(value.coverageId(), coverageId)) {
            throw conflict("REGISTRATION_INTENT_IDEMPOTENCY_MISMATCH", "幂等编码已用于不同的挂号意向");
        }
        return new CreateResult(view(value, true), value.feeAmount().signum() == 0);
    }

    private CompletionPlan plan(RegistrationBillingIntent value, boolean execute) {
        return new CompletionPlan(value.id(), value.residentId(), value.organizationId(), value.departmentId(),
                value.appointmentId(), value.scheduleId(), value.slotHoldId(), "REG-COMPLETE-" + value.id(), value.registrationSource(),
                value.visitType(), value.encounterId(), execute);
    }

    private ExecutionContext requireOrganizationContext(Long organizationId) {
        ExecutionContext context = contextProvider.requireCurrent();
        if (!context.hasWorkContext() || !context.canAccessOrganization(organizationId)) {
            throw badRequest("REGISTRATION_BILLING_CONTEXT_MISMATCH", "请在挂号机构工作上下文中办理");
        }
        return context;
    }

    private String required(String value, String code, String message) {
        if (value == null || value.isBlank() || value.trim().length() > 128) throw badRequest(code, message);
        return value.trim();
    }

    private String normalizeSource(String value, boolean scheduled) {
        String result = value == null || value.isBlank() ? (scheduled ? "WINDOW" : "DIRECT") : value.trim().toUpperCase();
        if (!List.of("WINDOW", "WALK_IN", "DIRECT", "EMERGENCY").contains(result)) {
            throw badRequest("REGISTRATION_SOURCE_INVALID", "挂号来源不正确");
        }
        return result;
    }

    private String normalizeVisit(String value) {
        String result = value == null || value.isBlank() ? "GENERAL" : value.trim().toUpperCase();
        if (!List.of("GENERAL", "FOLLOW_UP", "EMERGENCY").contains(result)) {
            throw badRequest("REGISTRATION_VISIT_TYPE_INVALID", "就诊类型不正确");
        }
        return result;
    }

    private String normalizeSettlementMode(String value) {
        String result = value == null || value.isBlank() ? "SELF_PAY" : value.trim().toUpperCase();
        if (!List.of("SELF_PAY", "MEDICAL_INSURANCE").contains(result)) {
            throw badRequest("REGISTRATION_SETTLEMENT_MODE_INVALID", "费用类别不正确");
        }
        return result;
    }

    private Long normalizeCoverageId(String settlementMode, Long coverageId) {
        if ("MEDICAL_INSURANCE".equals(settlementMode) && coverageId == null) {
            throw badRequest("REGISTRATION_COVERAGE_REQUIRED", "医保挂号必须选择患者有效保障");
        }
        if ("SELF_PAY".equals(settlementMode) && coverageId != null) {
            throw badRequest("REGISTRATION_COVERAGE_NOT_APPLICABLE", "自费挂号不能绑定医保保障");
        }
        return coverageId;
    }

    private RegistrationIntentView view(RegistrationBillingIntent value, boolean duplicate) {
        return new RegistrationIntentView(value.id(), value.revision(), value.residentId(), value.organizationId(),
                value.departmentId(), value.appointmentId(), value.scheduleId(), value.catalogItemId(), value.slotHoldId(),
                value.patientAccountId(), value.settlementId(), value.paymentOrderId(), value.encounterId(),
                value.idempotencyCode(), value.registrationSource(), value.visitType(), value.settlementMode(),
                value.coverageId(), value.coverageTypeCode(), value.coveragePayerName(), value.status(),
                value.feeAmount(), value.currencyCode(), value.itemCode(), value.itemName(), value.expiresAt(),
                value.completionAttempts(), value.lastErrorCode(), value.lastErrorMessage(), value.createdAt(),
                value.updatedAt(), value.completedAt(), duplicate);
    }

    private BigDecimal money(BigDecimal value) { return value.setScale(6, RoundingMode.HALF_UP); }
    private BigDecimal zero() { return BigDecimal.ZERO.setScale(6); }
    private String truncate(String value, int max) {
        if (value == null) return null; return value.length() <= max ? value : value.substring(0, max);
    }

    record CreateCommand(Long residentId, Long organizationId, Long departmentId, Long appointmentId, Long scheduleId,
                         String idempotencyCode, String registrationSource, String visitType,
                         String settlementMode, Long coverageId) {}
    record CreateResult(RegistrationIntentView view, boolean zeroFee) {}
    record CompletionPlan(Long intentId, Long residentId, Long organizationId, Long departmentId,
                          Long appointmentId, Long scheduleId, Long slotHoldId, String idempotencyCode,
                          String registrationSource, String visitType, Long encounterId, boolean execute) {}
    record CancellationPlan(Long intentId, String billingStatus, BigDecimal amount, String currencyCode,
                            Long originalPaymentId, boolean readyToClose) {
        static CancellationPlan notApplicable() {
            return new CancellationPlan(null, "NOT_APPLICABLE", BigDecimal.ZERO.setScale(6), "CNY", null, true);
        }
    }
}
