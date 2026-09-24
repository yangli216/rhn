package com.rhn.billing.application;

import com.rhn.billing.api.InpatientBillingDirectory;
import com.rhn.billing.domain.ChargeItem;
import com.rhn.billing.domain.ChargeItemComponent;
import com.rhn.billing.domain.LedgerEntry;
import com.rhn.billing.domain.PatientAccount;
import com.rhn.billing.domain.Payment;
import com.rhn.billing.domain.Settlement;
import com.rhn.billing.infrastructure.ChargeItemComponentRepository;
import com.rhn.billing.infrastructure.ChargeItemRepository;
import com.rhn.billing.infrastructure.LedgerEntryRepository;
import com.rhn.billing.infrastructure.PatientAccountRepository;
import com.rhn.billing.infrastructure.PaymentRepository;
import com.rhn.billing.infrastructure.SettlementRepository;
import com.rhn.billing.infrastructure.SettlementTenderRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

import static com.rhn.shared.api.BusinessErrors.conflict;

@Service
public class JpaInpatientBillingDirectory implements InpatientBillingDirectory {
    private static final String DEPOSIT_SCENE = "INPATIENT_PREPAYMENT";
    private static final String EXECUTION_SOURCE = "INPATIENT_ORDER_TASK";
    private static final String BED_DAY_SOURCE = "INPATIENT_BED_DAY";

    private final PatientAccountRepository accounts;
    private final ChargeItemRepository charges;
    private final ChargeItemComponentRepository components;
    private final PaymentRepository payments;
    private final LedgerEntryRepository ledger;
    private final SettlementRepository settlements;
    private final SettlementTenderRepository tenders;
    private final BillingApplicationService billingService;

    public JpaInpatientBillingDirectory(PatientAccountRepository accounts,
                                        ChargeItemRepository charges,
                                        ChargeItemComponentRepository components,
                                        PaymentRepository payments,
                                        LedgerEntryRepository ledger,
                                        SettlementRepository settlements,
                                        SettlementTenderRepository tenders,
                                        BillingApplicationService billingService) {
        this.accounts = accounts;
        this.charges = charges;
        this.components = components;
        this.payments = payments;
        this.ledger = ledger;
        this.settlements = settlements;
        this.tenders = tenders;
        this.billingService = billingService;
    }

    @Override
    @Transactional(readOnly = true)
    public AccountSnapshot account(Long tenantId, Long encounterId, String currencyCode) {
        PatientAccount account = accounts.findByTenantIdAndEncounterIdAndCurrencyCode(
                tenantId, encounterId, currencyCode).orElse(null);
        if (account == null) return AccountSnapshot.unopened();
        requireInpatient(account);
        List<Payment> accountPayments = payments.findByTenantIdAndPatientAccountIdOrderByPaidAtAscIdAsc(
                tenantId, account.id());
        List<DepositSnapshot> depositRecords = accountPayments.stream().filter(this::isDeposit)
                .map(value -> depositSnapshot(tenantId, value)).toList();
        BigDecimal deposit = money(depositRecords.stream()
                .map(DepositSnapshot::availableAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add));
        BigDecimal balance = money(ledger.balance(tenantId, account.id()));
        var posted = charges.findByTenantIdAndPatientAccountIdOrderByOccurredAtAscIdAsc(tenantId, account.id())
                .stream().filter(value -> currencyCode.equals(value.currencyCode()))
                .map(this::snapshot).toList();
        return new AccountSnapshot(account.id(), account.status(), deposit, balance,
                latestSettlement(tenantId, account), depositRecords, posted);
    }

    @Override
    @Transactional
    public DepositResult registerDeposit(DepositCommand command) {
        Payment existing = payments.findByTenantIdAndPaymentNo(command.tenantId(), command.paymentNo()).orElse(null);
        if (existing != null) return replay(command, existing);
        PatientAccount account = accounts.findByTenantIdAndEncounterIdAndCurrencyCode(
                        command.tenantId(), command.encounterId(), command.currencyCode())
                .orElseGet(() -> accounts.save(PatientAccount.inpatient(
                        command.tenantId(), command.residentId(), command.encounterId(), command.organizationId(),
                        command.departmentId(), command.currencyCode())));
        requireInpatient(account);
        Instant paidAt = command.paidAt() == null ? Instant.now() : command.paidAt();
        Payment payment = payments.save(new Payment(
                command.tenantId(), account.organizationId(), account.departmentId(),
                account.id(), null, null, command.paymentNo(), "PAYMENT",
                command.paymentMethodCode(), DEPOSIT_SCENE, money(command.amount()), command.currencyCode(), paidAt,
                command.externalTransactionNo(), null, command.actorId(), command.description()));
        ledger.save(new LedgerEntry(command.tenantId(), account.id(), "PAYMENT", "CREDIT", money(command.amount()),
                command.currencyCode(), null, null, payment.id(), null, paidAt, command.actorId()));
        return result(payment, false);
    }

    @Override
    @Transactional
    public void postExecutedOrderTask(ExecutedOrderChargeCommand command) {
        if (charges.findByTenantIdAndSourceTypeAndSourceId(
                command.tenantId(), EXECUTION_SOURCE, command.taskId()).isPresent()) return;
        PatientAccount account = accounts.findByTenantIdAndEncounterIdAndCurrencyCode(
                        command.tenantId(), command.encounterId(), command.currencyCode())
                .orElseGet(() -> accounts.save(PatientAccount.inpatient(
                        command.tenantId(), command.residentId(), command.encounterId(), command.organizationId(),
                        command.departmentId(), command.currencyCode())));
        requireInpatient(account);
        BigDecimal quantity = BigDecimal.ONE;
        BigDecimal unitPrice = money(command.unitPrice());
        BigDecimal amount = money(command.totalAmount());
        String accountingCategory = command.accountingCategory() != null && !command.accountingCategory().isBlank()
                ? command.accountingCategory().trim()
                : "TREATMENT";
        ChargeItem charge = charges.save(new ChargeItem(
                command.tenantId(), command.organizationId(), command.departmentId(),
                account.id(), command.residentId(), command.encounterId(), command.requestId(),
                command.catalogItemId(), EXECUTION_SOURCE, command.taskId(),
                command.requestNo() + "-" + command.occurrenceNo(), quantity, command.unitCode(), unitPrice, amount,
                command.currencyCode(), command.priceId(), command.priceRevision(), command.priceType(),
                command.itemCode(), command.itemName(), command.completedAt(), command.completedBy(), null,
                accountingCategory));
        components.save(new ChargeItemComponent(
                command.tenantId(), charge.id(), command.catalogItemId(), command.itemCode(), command.itemName(),
                quantity, command.unitCode(), BigDecimal.ONE, unitPrice, amount));
        ledger.save(new LedgerEntry(
                command.tenantId(), account.id(), "CHARGE", "DEBIT", amount, command.currencyCode(), charge.id(),
                null, null, null, command.completedAt(), command.completedBy()));
    }

    @Override
    @Transactional
    public void postBedDay(BedDayChargeCommand command) {
        if (charges.findByTenantIdAndSourceTypeAndSourceId(
                command.tenantId(), BED_DAY_SOURCE, command.bedDayFactId()).isPresent()) return;
        PatientAccount account = accounts.findByTenantIdAndEncounterIdAndCurrencyCode(
                        command.tenantId(), command.encounterId(), command.currencyCode())
                .orElseGet(() -> accounts.save(PatientAccount.inpatient(
                        command.tenantId(), command.residentId(), command.encounterId(), command.organizationId(),
                        command.departmentId(), command.currencyCode())));
        requireInpatient(account);
        BigDecimal quantity = BigDecimal.ONE;
        BigDecimal unitPrice = money(command.unitPrice());
        ChargeItem charge = charges.save(new ChargeItem(
                command.tenantId(), command.organizationId(), command.departmentId(),
                account.id(), command.residentId(), command.encounterId(), null,
                command.catalogItemId(), BED_DAY_SOURCE, command.bedDayFactId(),
                "BED-DAY-" + command.bedDayFactId(), quantity, "床日", unitPrice, unitPrice,
                command.currencyCode(), command.priceId(), command.priceRevision(), command.priceType(),
                command.itemCode(), command.itemName(), command.occurredAt(), command.actorId(), null,
                "BED"));
        components.save(new ChargeItemComponent(
                command.tenantId(), charge.id(), command.catalogItemId(), command.itemCode(), command.itemName(),
                quantity, "床日", BigDecimal.ONE, unitPrice, unitPrice));
        ledger.save(new LedgerEntry(
                command.tenantId(), account.id(), "CHARGE", "DEBIT", unitPrice, command.currencyCode(), charge.id(),
                null, null, null, command.occurredAt(), command.actorId()));
    }

    @Override
    @Transactional
    public FinalSettlementResult issueFinalSettlement(FinalSettlementCommand command) {
        var existing = settlements.findByTenantIdAndSettlementNo(command.tenantId(), command.invoiceNo()).orElse(null);
        var invoice = billingService.issueInvoice(command.patientAccountId(),
                new BillingApplicationService.IssueInvoiceCommand(
                        command.invoiceNo(), command.issuedAt(), "INPATIENT", "CASHIER", command.terminalCode()));
        Settlement settlement = settlements.findByTenantIdAndLegacyInvoiceId(command.tenantId(), invoice.id())
                .orElseThrow(() -> conflict("INPATIENT_SETTLEMENT_MISSING", "住院结算凭证缺少正式结算单"));
        BigDecimal prepayment = money(tenders.findByTenantIdAndSettlementIdOrderByLineNoAsc(
                        command.tenantId(), settlement.id()).stream()
                .filter(value -> "PREPAYMENT".equals(value.tenderType()))
                .map(value -> value.tenderAmount()).reduce(BigDecimal.ZERO, BigDecimal::add));
        BigDecimal paid = money(tenders.totalTendered(command.tenantId(), settlement.id()));
        PatientAccount account = account(command.tenantId(), settlement);
        FinancialSettlementSnapshot financial = financialSnapshot(command.tenantId(), account, settlement);
        closeIfSettled(account, financial);
        return new FinalSettlementResult(invoice.id(), settlement.id(), invoice.invoiceNo(), settlement.settlementNo(),
                settlement.status(), settlement.netAmount(), prepayment, paid,
                financial.outstandingAmount(), financial.refundableAmount(), financial.financialStatus(),
                settlement.currencyCode(), existing != null);
    }

    @Override
    @Transactional
    public SettlementPaymentResult collectFinalPayment(SettlementPaymentCommand command) {
        Settlement settlement = requireSettlement(command.tenantId(), command.settlementId());
        Payment replay = payments.findByTenantIdAndPaymentNo(command.tenantId(), command.commandCode()).orElse(null);
        if (replay != null) {
            verifySettlementPaymentReplay(command, settlement, replay);
            PatientAccount account = account(command.tenantId(), settlement);
            FinancialSettlementSnapshot financial = financialSnapshot(command.tenantId(), account, settlement);
            closeIfSettled(account, financial);
            return new SettlementPaymentResult(replay.id(), true, financial);
        }
        PatientAccount lockedAccount = accounts.lockByIdAndTenantId(
                        settlement.patientAccountId(), command.tenantId())
                .orElseThrow(() -> conflict("INPATIENT_SETTLEMENT_ACCOUNT_MISSING", "住院结算缺少费用账户"));
        requireInpatient(lockedAccount);
        settlement = settlements.lockByIdAndTenantId(settlement.id(), command.tenantId())
                .orElseThrow(() -> conflict("INPATIENT_SETTLEMENT_NOT_FOUND", "未找到住院结算单"));
        requireRevision(settlement, command.expectedRevision());
        if (!"INPATIENT".equals(settlement.settlementScene())) {
            throw conflict("INPATIENT_SETTLEMENT_SCENE_INVALID", "当前结算单不是住院结算");
        }
        FinancialSettlementSnapshot before = financialSnapshot(command.tenantId(), lockedAccount, settlement);
        BigDecimal amount = money(command.amount());
        if (!"PENDING_PAYMENT".equals(before.financialStatus())) {
            throw conflict("INPATIENT_PAYMENT_NOT_REQUIRED", "当前住院结算没有待补缴金额");
        }
        if (amount.signum() <= 0 || amount.compareTo(before.outstandingAmount()) > 0) {
            throw conflict("INPATIENT_PAYMENT_EXCEEDS_OUTSTANDING", "补缴金额必须大于零且不能超过待补缴金额");
        }
        var payment = billingService.collectPayment(settlement.legacyInvoiceId(),
                new BillingApplicationService.PaymentCommand(command.commandCode(), command.paymentMethodCode(),
                        "CASHIER", amount, command.paidAt(), command.externalTransactionNo(),
                        command.description(), null));
        Settlement refreshed = requireSettlement(command.tenantId(), settlement.id());
        PatientAccount account = account(command.tenantId(), refreshed);
        FinancialSettlementSnapshot financial = financialSnapshot(command.tenantId(), account, refreshed);
        closeIfSettled(account, financial);
        return new SettlementPaymentResult(payment.id(), false, financial);
    }

    @Override
    @Transactional
    public SurplusRefundResult refundSurplus(SurplusRefundCommand command) {
        Settlement settlement = requireSettlement(command.tenantId(), command.settlementId());
        PatientAccount account = accounts.lockByIdAndTenantId(settlement.patientAccountId(), command.tenantId())
                .orElseThrow(() -> conflict("INPATIENT_SETTLEMENT_ACCOUNT_MISSING", "住院结算缺少费用账户"));
        requireInpatient(account);
        settlement = settlements.lockByIdAndTenantId(settlement.id(), command.tenantId())
                .orElseThrow(() -> conflict("INPATIENT_SETTLEMENT_NOT_FOUND", "未找到住院结算单"));
        List<Payment> accountPayments = payments.findByTenantIdAndPatientAccountIdOrderByPaidAtAscIdAsc(
                command.tenantId(), account.id());
        List<Payment> replays = accountPayments.stream().filter(value -> "REFUND".equals(value.paymentType()))
                .filter(value -> value.paymentNo().equals(command.commandCode())
                        || value.paymentNo().startsWith(command.commandCode() + "-"))
                .toList();
        if (!replays.isEmpty()) {
            BigDecimal replayed = money(replays.stream().map(Payment::amount)
                    .reduce(BigDecimal.ZERO, BigDecimal::add));
            if (replayed.compareTo(money(command.amount())) != 0) {
                throw conflict("INPATIENT_REFUND_COMMAND_REUSED", "退余命令编码已用于不同退款金额");
            }
            FinancialSettlementSnapshot financial = financialSnapshot(command.tenantId(), account, settlement);
            closeIfSettled(account, financial);
            return new SurplusRefundResult(replays.stream().map(Payment::id).toList(), true, financial);
        }
        requireRevision(settlement, command.expectedRevision());
        FinancialSettlementSnapshot before = financialSnapshot(command.tenantId(), account, settlement);
        BigDecimal amount = money(command.amount());
        if (!"PENDING_REFUND".equals(before.financialStatus())) {
            throw conflict("INPATIENT_REFUND_NOT_REQUIRED", "当前住院结算没有待退余额");
        }
        if (amount.signum() <= 0 || amount.compareTo(before.refundableAmount()) > 0) {
            throw conflict("INPATIENT_REFUND_AMOUNT_INVALID", "退余金额必须大于零且不能超过待退余额");
        }
        BigDecimal remaining = amount;
        List<Long> refundIds = new ArrayList<>();
        int lineNo = 1;
        for (Payment deposit : accountPayments.stream().filter(this::isDeposit).toList()) {
            BigDecimal available = availableOriginalDeposit(command.tenantId(), deposit);
            if (available.signum() <= 0) continue;
            BigDecimal refundAmount = money(available.min(remaining));
            String refundNo = lineNo == 1 ? command.commandCode() : command.commandCode() + "-" + lineNo;
            var refund = billingService.refundPayment(deposit.id(), new BillingApplicationService.RefundCommand(
                    refundNo, refundAmount, command.refundedAt(), command.externalTransactionNo(),
                    command.reason(), null, "CASHIER"));
            refundIds.add(refund.id());
            remaining = money(remaining.subtract(refundAmount));
            lineNo++;
            if (remaining.signum() == 0) break;
        }
        if (remaining.signum() != 0) {
            throw conflict("INPATIENT_REFUND_SOURCE_INSUFFICIENT", "可退住院预交金来源不足");
        }
        FinancialSettlementSnapshot financial = financialSnapshot(command.tenantId(), account, settlement);
        closeIfSettled(account, financial);
        return new SurplusRefundResult(refundIds, false, financial);
    }

    private BigDecimal availableOriginalDeposit(Long tenantId, Payment payment) {
        BigDecimal allocated = tenders.findByTenantIdAndPaymentId(tenantId, payment.id())
                .filter(value -> "PREPAYMENT".equals(value.tenderType()))
                .map(value -> value.tenderAmount()).orElse(BigDecimal.ZERO);
        BigDecimal refunded = money(payments.refundedForPayment(tenantId, payment.id()));
        return money(payment.amount().subtract(allocated).subtract(refunded));
    }

    private DepositSnapshot depositSnapshot(Long tenantId, Payment payment) {
        BigDecimal allocated = money(tenders.findByTenantIdAndPaymentId(tenantId, payment.id())
                .filter(value -> "PREPAYMENT".equals(value.tenderType()))
                .map(value -> value.tenderAmount()).orElse(BigDecimal.ZERO));
        BigDecimal refunded = money(payments.refundedForPayment(tenantId, payment.id()));
        BigDecimal available = money(payment.amount().subtract(allocated).subtract(refunded).max(BigDecimal.ZERO));
        return new DepositSnapshot(payment.id(), payment.paymentNo(), money(payment.amount()), allocated,
                refunded, available, payment.currencyCode(), payment.paymentMethodCode(), payment.paidAt(),
                payment.externalTransactionNo(), payment.description());
    }

    private FinancialSettlementSnapshot latestSettlement(Long tenantId, PatientAccount account) {
        return settlements.findByTenantIdAndPatientAccountIdOrderByCreatedAtAscIdAsc(tenantId, account.id()).stream()
                .filter(value -> "INPATIENT".equals(value.settlementScene()))
                .filter(value -> "NORMAL".equals(value.settlementType()))
                .reduce((left, right) -> right)
                .map(value -> financialSnapshot(tenantId, account, value))
                .orElse(null);
    }

    private FinancialSettlementSnapshot financialSnapshot(Long tenantId, PatientAccount account,
                                                           Settlement settlement) {
        BigDecimal prepayment = money(tenders.findByTenantIdAndSettlementIdOrderByLineNoAsc(
                        tenantId, settlement.id()).stream()
                .filter(value -> "PREPAYMENT".equals(value.tenderType()))
                .map(value -> value.tenderAmount()).reduce(BigDecimal.ZERO, BigDecimal::add));
        BigDecimal paid = money(tenders.totalTendered(tenantId, settlement.id()));
        BigDecimal outstanding = money(settlement.netAmount().subtract(paid).max(BigDecimal.ZERO));
        BigDecimal availableDeposit = money(payments
                .findByTenantIdAndPatientAccountIdOrderByPaidAtAscIdAsc(tenantId, account.id()).stream()
                .filter(this::isDeposit)
                .map(value -> availableOriginalDeposit(tenantId, value))
                .reduce(BigDecimal.ZERO, BigDecimal::add).max(BigDecimal.ZERO));
        BigDecimal balance = money(ledger.balance(tenantId, account.id()));
        BigDecimal credit = money(balance.negate().max(BigDecimal.ZERO));
        BigDecimal refundable = money(availableDeposit.min(credit));
        String financialStatus;
        if (outstanding.signum() > 0) financialStatus = "PENDING_PAYMENT";
        else if (refundable.signum() > 0) financialStatus = "PENDING_REFUND";
        else if ("SETTLED".equals(settlement.status())) financialStatus = "SETTLED";
        else financialStatus = "PAYMENT_REVIEW";
        return new FinancialSettlementSnapshot(settlement.legacyInvoiceId(), settlement.id(), settlement.revision(),
                settlement.settlementNo(), settlement.settlementNo(), settlement.status(), financialStatus,
                money(settlement.netAmount()), prepayment, paid, outstanding, refundable,
                settlement.currencyCode(), settlement.finalizedAt());
    }

    private Settlement requireSettlement(Long tenantId, Long settlementId) {
        return settlements.findByIdAndTenantId(settlementId, tenantId)
                .orElseThrow(() -> conflict("INPATIENT_SETTLEMENT_NOT_FOUND", "未找到住院结算单"));
    }

    private PatientAccount account(Long tenantId, Settlement settlement) {
        PatientAccount account = accounts.findByIdAndTenantId(settlement.patientAccountId(), tenantId)
                .orElseThrow(() -> conflict("INPATIENT_SETTLEMENT_ACCOUNT_MISSING", "住院结算缺少费用账户"));
        requireInpatient(account);
        return account;
    }

    private void requireRevision(Settlement settlement, long expectedRevision) {
        if (settlement.revision() != expectedRevision) {
            throw conflict("INPATIENT_SETTLEMENT_REVISION_CONFLICT", "住院结算已被其他操作更新，请刷新后重试");
        }
    }

    private void verifySettlementPaymentReplay(SettlementPaymentCommand command, Settlement settlement,
                                               Payment payment) {
        if (!"PAYMENT".equals(payment.paymentType())
                || !Objects.equals(payment.invoiceId(), settlement.legacyInvoiceId())
                || payment.amount().compareTo(money(command.amount())) != 0
                || !payment.paymentMethodCode().equals(command.paymentMethodCode())) {
            throw conflict("INPATIENT_PAYMENT_COMMAND_REUSED", "补缴命令编码已用于不同支付内容");
        }
    }

    private boolean isDeposit(Payment payment) {
        return "PAYMENT".equals(payment.paymentType()) && payment.invoiceId() == null
                && DEPOSIT_SCENE.equals(payment.paymentSceneCode()) && "COMPLETED".equals(payment.status());
    }

    private void closeIfSettled(PatientAccount account, FinancialSettlementSnapshot settlement) {
        if ("SETTLED".equals(settlement.financialStatus())) {
            account.close(settlement.finalizedAt() == null ? Instant.now() : settlement.finalizedAt());
        }
    }

    private DepositResult replay(DepositCommand command, Payment payment) {
        PatientAccount account = accounts.findByIdAndTenantId(payment.patientAccountId(), command.tenantId())
                .orElseThrow(() -> conflict("INPATIENT_DEPOSIT_ACCOUNT_MISSING", "预交金对应的住院账户不存在"));
        requireInpatient(account);
        if (!Objects.equals(account.encounterId(), command.encounterId())
                || payment.invoiceId() != null || !"PAYMENT".equals(payment.paymentType())
                || !DEPOSIT_SCENE.equals(payment.paymentSceneCode())
                || payment.amount().compareTo(money(command.amount())) != 0
                || !payment.currencyCode().equals(command.currencyCode())
                || !payment.paymentMethodCode().equals(command.paymentMethodCode())) {
            throw conflict("INPATIENT_DEPOSIT_NO_REUSED", "预交金凭证号已被不同支付内容使用");
        }
        return result(payment, true);
    }

    private DepositResult result(Payment payment, boolean duplicate) {
        return new DepositResult(payment.id(), payment.paymentNo(), payment.amount(), payment.currencyCode(),
                payment.paymentMethodCode(), payment.paidAt(), duplicate);
    }

    private PostedCharge snapshot(ChargeItem value) {
        return new PostedCharge(value.id(), value.requestId(), value.sourceType(), value.sourceId(),
                value.requestCode(), value.status(), value.catalogItemId(), value.itemCodeSnapshot(),
                value.itemNameSnapshot(), value.quantity(), value.unitCode(), value.unitPrice(),
                value.totalAmount(), value.currencyCode(), value.occurredAt(), value.accountingCategory());
    }

    private void requireInpatient(PatientAccount account) {
        if (!"INPATIENT".equals(account.accountType())) {
            throw conflict("INPATIENT_ACCOUNT_TYPE_INVALID", "当前就诊费用账户不是住院账户");
        }
    }

    private BigDecimal money(BigDecimal value) {
        return value.setScale(6, RoundingMode.HALF_UP);
    }
}
