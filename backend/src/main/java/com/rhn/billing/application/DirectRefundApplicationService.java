package com.rhn.billing.application;

import com.rhn.billing.api.PaymentResultDirectory.PaymentOrderView;
import com.rhn.billing.api.RefundBillingDirectory;
import com.rhn.billing.api.RefundBillingDirectory.RefundBillingSnapshot;
import com.rhn.billing.api.RefundBillingDirectory.RefundChargeSnapshot;
import com.rhn.billing.api.RefundBillingDirectory.RefundPaymentContext;
import com.rhn.billing.api.RefundPreCheckViews.DirectRefundCommand;
import com.rhn.billing.api.RefundPreCheckViews.RefundPaymentCandidateView;
import com.rhn.billing.domain.ChargeItem;
import com.rhn.billing.domain.ChargeItemComponent;
import com.rhn.billing.domain.LedgerEntry;
import com.rhn.billing.domain.PatientAccount;
import com.rhn.billing.domain.Payment;
import com.rhn.billing.domain.Receipt;
import com.rhn.billing.domain.Settlement;
import com.rhn.billing.infrastructure.ChargeItemComponentRepository;
import com.rhn.billing.infrastructure.ChargeItemRepository;
import com.rhn.billing.infrastructure.LedgerEntryRepository;
import com.rhn.billing.infrastructure.PatientAccountRepository;
import com.rhn.billing.infrastructure.PaymentRepository;
import com.rhn.billing.infrastructure.ReceiptRepository;
import com.rhn.billing.infrastructure.SettlementRepository;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Billing-side refund capability.
 *
 * Owns accounting facts, charge reversal, payment refund and fiscal receipt red-flush.
 * Cross-domain eligibility and downstream cancellation are coordinated outside billing.
 */
@Service
public class DirectRefundApplicationService implements RefundBillingDirectory {
    private static final Logger log = LoggerFactory.getLogger(DirectRefundApplicationService.class);

    private final PaymentRepository payments;
    private final PatientAccountRepository accounts;
    private final ChargeItemRepository charges;
    private final ChargeItemComponentRepository components;
    private final LedgerEntryRepository ledger;
    private final SettlementRepository settlements;
    private final ReceiptRepository receipts;
    private final PaymentOrchestrationService paymentOrchestration;
    private final ReceiptApplicationService receiptService;
    private final RefundPolicy refundPolicy;
    private final ExecutionContextProvider contextProvider;

    public DirectRefundApplicationService(PaymentRepository payments,
                                          PatientAccountRepository accounts,
                                          ChargeItemRepository charges,
                                          ChargeItemComponentRepository components,
                                          LedgerEntryRepository ledger,
                                          SettlementRepository settlements,
                                          ReceiptRepository receipts,
                                          PaymentOrchestrationService paymentOrchestration,
                                          ReceiptApplicationService receiptService,
                                          RefundPolicy refundPolicy,
                                          ExecutionContextProvider contextProvider) {
        this.payments = payments;
        this.accounts = accounts;
        this.charges = charges;
        this.components = components;
        this.ledger = ledger;
        this.settlements = settlements;
        this.receipts = receipts;
        this.paymentOrchestration = paymentOrchestration;
        this.receiptService = receiptService;
        this.refundPolicy = refundPolicy;
        this.contextProvider = contextProvider;
    }

    @Override
    @Transactional(readOnly = true)
    public RefundBillingSnapshot snapshotForEncounter(Long encounterId) {
        ExecutionContext context = contextProvider.requireCurrent();
        List<PatientAccount> matchingAccounts = accounts.findByTenantIdAndEncounterIdIn(
                context.tenantId(), List.of(encounterId));
        if (matchingAccounts.isEmpty()) {
            return RefundBillingSnapshot.missingAccount(encounterId);
        }

        PatientAccount account = matchingAccounts.get(0);
        List<ChargeItem> allCharges = charges.findByTenantIdAndPatientAccountIdOrderByOccurredAtAscIdAsc(
                context.tenantId(), account.id());

        Set<Long> reversedChargeIds = allCharges.stream()
                .filter(charge -> charge.totalAmount() != null && charge.totalAmount().signum() < 0)
                .map(ChargeItem::reversesChargeItemId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());

        List<RefundChargeSnapshot> chargeSnapshots = allCharges.stream()
                .filter(charge -> charge.totalAmount() != null && charge.totalAmount().signum() > 0)
                .map(charge -> new RefundChargeSnapshot(
                        charge.id(), charge.sourceType(), charge.sourceId(), charge.requestCode(),
                        charge.itemNameSnapshot(), charge.itemCodeSnapshot(), charge.quantity(),
                        charge.unitCode(), charge.totalAmount(), reversedChargeIds.contains(charge.id())))
                .toList();

        List<RefundPaymentCandidateView> candidatePayments = new ArrayList<>();
        BigDecimal totalPaid = BigDecimal.ZERO;
        for (Payment payment : payments.findByTenantIdAndPatientAccountIdOrderByPaidAtAscIdAsc(
                context.tenantId(), account.id())) {
            if (!"PAYMENT".equals(payment.paymentType())) {
                continue;
            }
            totalPaid = totalPaid.add(payment.amount());
            BigDecimal refunded = payments.refundedForPayment(context.tenantId(), payment.id());
            BigDecimal refundedAmount = refunded == null ? BigDecimal.ZERO : refunded;
            BigDecimal remaining = payment.amount().subtract(refundedAmount);
            if (remaining.signum() > 0) {
                candidatePayments.add(new RefundPaymentCandidateView(
                        payment.id(), payment.paymentNo(), payment.paymentMethodCode(), payment.amount(),
                        refundedAmount, remaining, payment.currencyCode(), payment.paidAt()));
            }
        }

        boolean directRefundAllowed = refundPolicy.isUnexecutedDirectRefundAllowed(
                context, account.organizationId(), null);

        return new RefundBillingSnapshot(
                encounterId, account.id(), account.organizationId(), directRefundAllowed,
                totalPaid, account.currencyCode(), chargeSnapshots, candidatePayments);
    }

    @Override
    @Transactional(readOnly = true)
    public RefundPaymentContext paymentContext(Long paymentId) {
        ExecutionContext context = contextProvider.requireCurrent();
        Payment payment = requireOriginalPayment(paymentId, context);
        PatientAccount account = accounts.findByIdAndTenantId(payment.patientAccountId(), context.tenantId())
                .orElseThrow(() -> new BusinessException("ACCOUNT_NOT_FOUND", "未找到关联费用账户", HttpStatus.NOT_FOUND));
        return new RefundPaymentContext(payment.id(), account.id(), account.encounterId());
    }

    @Override
    @Transactional
    public PaymentOrderView executeDirectRefund(Long paymentId, DirectRefundCommand command) {
        ExecutionContext context = contextProvider.requireCurrent();
        Payment originalPayment = requireOriginalPayment(paymentId, context);
        PatientAccount account = accounts.findByIdAndTenantId(originalPayment.patientAccountId(), context.tenantId())
                .orElseThrow(() -> new BusinessException("ACCOUNT_NOT_FOUND", "未找到关联费用账户", HttpStatus.NOT_FOUND));

        BigDecimal refunded = payments.refundedForPayment(context.tenantId(), originalPayment.id());
        BigDecimal remainingRefundable = originalPayment.amount().subtract(refunded == null ? BigDecimal.ZERO : refunded);

        BigDecimal refundAmount = command.amount();
        if (refundAmount == null || refundAmount.signum() <= 0) {
            throw new BusinessException("REFUND_AMOUNT_INVALID", "退款金额必须大于零", HttpStatus.BAD_REQUEST);
        }
        if (refundAmount.compareTo(remainingRefundable) > 0) {
            throw new BusinessException("REFUND_AMOUNT_EXCEEDED", "退款金额不能超过原支付记录剩余可退金额", HttpStatus.CONFLICT);
        }

        Set<Long> targetItemIds = command.chargeItemIds() != null && !command.chargeItemIds().isEmpty()
                ? new HashSet<>(command.chargeItemIds()) : null;

        BigDecimal currentBalance = ledger.balance(context.tenantId(), account.id());
        if (currentBalance == null) {
            currentBalance = BigDecimal.ZERO;
        }
        BigDecimal currentCredit = currentBalance.signum() < 0 ? currentBalance.abs() : BigDecimal.ZERO;

        if (refundAmount.compareTo(currentCredit) > 0) {
            List<ChargeItem> accountCharges = charges.findByTenantIdAndPatientAccountIdOrderByOccurredAtAscIdAsc(
                    context.tenantId(), account.id());
            List<ChargeItem> positiveCharges = accountCharges.stream()
                    .filter(charge -> charge.totalAmount() != null && charge.totalAmount().signum() > 0)
                    .filter(charge -> targetItemIds == null || targetItemIds.contains(charge.id()))
                    .toList();

            Set<Long> alreadyReversed = accountCharges.stream()
                    .map(ChargeItem::reversesChargeItemId)
                    .filter(Objects::nonNull)
                    .collect(Collectors.toSet());

            BigDecimal neededCredit = refundAmount.subtract(currentCredit);
            BigDecimal credited = BigDecimal.ZERO;
            Instant now = Instant.now();

            for (ChargeItem original : positiveCharges) {
                if (alreadyReversed.contains(original.id())) {
                    continue;
                }
                if (credited.compareTo(neededCredit) >= 0) {
                    break;
                }

                BigDecimal reversalAmount = original.totalAmount().negate();
                ChargeItem reversal = charges.save(new ChargeItem(
                        context.tenantId(), original.patientAccountId(), original.residentId(),
                        original.encounterId(), original.requestId(), original.catalogItemId(),
                        "DIRECT_REFUND", original.sourceId(), "REF-" + original.requestCode(),
                        original.quantity().negate(), original.unitCode(), original.unitPrice(),
                        reversalAmount, original.currencyCode(), original.priceId(),
                        original.priceRevision(), original.priceType(), original.itemCodeSnapshot(),
                        original.itemNameSnapshot(), now, context.subjectId(), original.id()));

                components.save(new ChargeItemComponent(
                        context.tenantId(), reversal.id(), original.catalogItemId(),
                        original.itemCodeSnapshot(), original.itemNameSnapshot(),
                        original.quantity().negate(), original.unitCode(), BigDecimal.ONE,
                        original.unitPrice(), reversalAmount));

                Long originalLedger = ledger.findByTenantIdAndChargeItemId(context.tenantId(), original.id())
                        .map(LedgerEntry::id).orElse(null);

                ledger.save(new LedgerEntry(
                        context.tenantId(), original.patientAccountId(), "CHARGE_REVERSAL", "CREDIT",
                        original.totalAmount().abs(), original.currencyCode(), reversal.id(),
                        null, null, originalLedger, now, context.subjectId()));

                credited = credited.add(original.totalAmount());
            }
        }

        PaymentOrderView refundOrder = paymentOrchestration.refund(
                new PaymentOrchestrationService.CreateRefundOrderCommand(
                        paymentId, command.idempotencyKey(), refundAmount, command.reason(),
                        "DIRECT-REFUND-" + account.encounterId(), command.terminalCode()));

        tryRedFlushFiscalReceipts(context.tenantId(), account.id(), command.idempotencyKey(), command.reason());
        return refundOrder;
    }

    private Payment requireOriginalPayment(Long paymentId, ExecutionContext context) {
        if (paymentId == null) {
            throw new BusinessException("PAYMENT_ID_REQUIRED", "退款原支付记录ID不能为空", HttpStatus.BAD_REQUEST);
        }
        Payment payment = payments.findByIdAndTenantId(paymentId, context.tenantId())
                .orElseThrow(() -> new BusinessException("PAYMENT_NOT_FOUND", "未找到对应的原支付记录", HttpStatus.NOT_FOUND));
        if (!"PAYMENT".equals(payment.paymentType())) {
            throw new BusinessException("INVALID_ORIGINAL_PAYMENT", "只能针对正向支付记录办理退款", HttpStatus.CONFLICT);
        }
        return payment;
    }

    private void tryRedFlushFiscalReceipts(Long tenantId, Long accountId, String idempotencyKey, String reason) {
        try {
            List<Settlement> accountSettlements = settlements
                    .findByTenantIdAndPatientAccountIdOrderByCreatedAtAscIdAsc(tenantId, accountId);
            for (Settlement settlement : accountSettlements) {
                List<Receipt> settlementReceipts = receipts
                        .findByTenantIdAndSettlementIdOrderByCreatedAtAscIdAsc(tenantId, settlement.id());
                for (Receipt receipt : settlementReceipts) {
                    if ("ISSUED".equals(receipt.status()) && !"RED_FLUSH".equals(receipt.receiptType())) {
                        Optional<Receipt> redOpt = receipts.findByTenantIdAndReversesReceiptId(tenantId, receipt.id());
                        if (redOpt.isEmpty()) {
                            String commandCode = "RF-" + idempotencyKey;
                            receiptService.redFlush(receipt.id(), commandCode, reason, null);
                            log.info("Direct refund triggered fiscal receipt red-flush for receipt {}", receipt.receiptNo());
                        }
                    }
                }
            }
        } catch (Exception ex) {
            log.warn("Fiscal receipt red-flush failed during direct refund: {}", ex.getMessage());
        }
    }
}
