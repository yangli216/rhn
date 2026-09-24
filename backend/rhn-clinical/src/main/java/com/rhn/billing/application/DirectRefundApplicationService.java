package com.rhn.billing.application;

import com.rhn.billing.api.PaymentResultDirectory.PaymentOrderView;
import com.rhn.billing.api.RefundPreCheckViews.DirectRefundCommand;
import com.rhn.billing.api.RefundPreCheckViews.RefundItemPreCheckView;
import com.rhn.billing.api.RefundPreCheckViews.RefundPreCheckSummaryView;
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
import com.rhn.pharmacy.api.RefundPharmacyDirectory;
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
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;

/**
 * 门诊直接退费与协同逆向作废编排服务。
 * billing 仅通过 pharmacy.api 请求药房逆向处理，不再修改药房内部实体或仓储。
 */
@Service
public class DirectRefundApplicationService {
    private static final Logger log = LoggerFactory.getLogger(DirectRefundApplicationService.class);

    private final PaymentRepository payments;
    private final PatientAccountRepository accounts;
    private final ChargeItemRepository charges;
    private final ChargeItemComponentRepository components;
    private final LedgerEntryRepository ledger;
    private final SettlementRepository settlements;
    private final ReceiptRepository receipts;
    private final RefundPharmacyDirectory pharmacy;
    private final PaymentOrchestrationService paymentOrchestration;
    private final ReceiptApplicationService receiptService;
    private final RefundPreCheckService preCheckService;
    private final ExecutionContextProvider contextProvider;

    public DirectRefundApplicationService(PaymentRepository payments,
                                          PatientAccountRepository accounts,
                                          ChargeItemRepository charges,
                                          ChargeItemComponentRepository components,
                                          LedgerEntryRepository ledger,
                                          SettlementRepository settlements,
                                          ReceiptRepository receipts,
                                          RefundPharmacyDirectory pharmacy,
                                          PaymentOrchestrationService paymentOrchestration,
                                          ReceiptApplicationService receiptService,
                                          RefundPreCheckService preCheckService,
                                          ExecutionContextProvider contextProvider) {
        this.payments = payments;
        this.accounts = accounts;
        this.charges = charges;
        this.components = components;
        this.ledger = ledger;
        this.settlements = settlements;
        this.receipts = receipts;
        this.pharmacy = pharmacy;
        this.paymentOrchestration = paymentOrchestration;
        this.receiptService = receiptService;
        this.preCheckService = preCheckService;
        this.contextProvider = contextProvider;
    }

    @Transactional
    public PaymentOrderView directRefund(Long paymentId, DirectRefundCommand command) {
        ExecutionContext context = contextProvider.requireCurrent();
        if (paymentId == null) {
            throw new BusinessException("PAYMENT_ID_REQUIRED", "退款原支付记录ID不能为空", HttpStatus.BAD_REQUEST);
        }
        Payment originalPayment = payments.findByIdAndTenantId(paymentId, context.tenantId())
                .orElseThrow(() -> new BusinessException("PAYMENT_NOT_FOUND", "未找到对应的原支付记录", HttpStatus.NOT_FOUND));

        if (!"PAYMENT".equals(originalPayment.paymentType())) {
            throw new BusinessException("INVALID_ORIGINAL_PAYMENT", "只能针对正向支付记录办理退款", HttpStatus.CONFLICT);
        }

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

        RefundPreCheckSummaryView preCheck = preCheckService.preCheck(account.encounterId());

        Set<Long> targetItemIds = command.chargeItemIds() != null && !command.chargeItemIds().isEmpty()
                ? new HashSet<>(command.chargeItemIds()) : null;

        List<RefundItemPreCheckView> itemsToCheck = preCheck.items().stream()
                .filter(item -> targetItemIds == null || targetItemIds.contains(item.chargeItemId()))
                .toList();

        List<RefundItemPreCheckView> blockedItems = itemsToCheck.stream()
                .filter(item -> !item.allowed())
                .toList();

        if (!blockedItems.isEmpty()) {
            String reasons = blockedItems.stream()
                    .map(item -> item.itemName() + "(" + item.blockReason() + ")")
                    .reduce((a, b) -> a + "；" + b).orElse("存在阻断项");
            throw new BusinessException("REFUND_PRECHECK_BLOCKED", "退费前置校验阻断：" + reasons, HttpStatus.CONFLICT);
        }

        if (!preCheck.eligibleForRefund()) {
            throw new BusinessException("REFUND_PRECHECK_BLOCKED",
                    "退费前置校验阻断：" + (preCheck.summaryNotice() != null ? preCheck.summaryNotice() : "当前就诊不满足退费条件"),
                    HttpStatus.CONFLICT);
        }

        BigDecimal currentBalance = ledger.balance(context.tenantId(), account.id());
        if (currentBalance == null) {
            currentBalance = BigDecimal.ZERO;
        }
        BigDecimal currentCredit = currentBalance.signum() < 0 ? currentBalance.abs() : BigDecimal.ZERO;

        if (refundAmount.compareTo(currentCredit) > 0) {
            List<ChargeItem> positiveCharges = charges.findByTenantIdAndPatientAccountIdOrderByOccurredAtAscIdAsc(
                    context.tenantId(), account.id()).stream()
                    .filter(c -> c.totalAmount() != null && c.totalAmount().signum() > 0)
                    .filter(c -> targetItemIds == null || targetItemIds.contains(c.id()))
                    .toList();

            Set<Long> alreadyReversed = charges.findByTenantIdAndPatientAccountIdOrderByOccurredAtAscIdAsc(
                    context.tenantId(), account.id()).stream()
                    .map(ChargeItem::reversesChargeItemId)
                    .filter(Objects::nonNull)
                    .collect(java.util.stream.Collectors.toSet());

            BigDecimal neededCredit = refundAmount.subtract(currentCredit);
            BigDecimal credited = BigDecimal.ZERO;
            Instant now = Instant.now();

            for (ChargeItem original : positiveCharges) {
                if (alreadyReversed.contains(original.id())) continue;
                if (credited.compareTo(neededCredit) >= 0) break;

                BigDecimal reversalAmount = original.totalAmount().negate();
                ChargeItem reversal = charges.save(new ChargeItem(
                        context.tenantId(), original.organizationId(), original.departmentId(),
                        original.patientAccountId(), original.residentId(),
                        original.encounterId(), original.requestId(), original.catalogItemId(),
                        "DIRECT_REFUND", original.sourceId(), "REF-" + original.requestCode(),
                        original.quantity().negate(), original.unitCode(), original.unitPrice(),
                        reversalAmount, original.currencyCode(), original.priceId(),
                        original.priceRevision(), original.priceType(), original.itemCodeSnapshot(),
                        original.itemNameSnapshot(), now, context.subjectId(), original.id(),
                        original.accountingCategory()
                ));

                components.save(new ChargeItemComponent(
                        context.tenantId(), reversal.id(), original.catalogItemId(),
                        original.itemCodeSnapshot(), original.itemNameSnapshot(),
                        original.quantity().negate(), original.unitCode(), BigDecimal.ONE,
                        original.unitPrice(), reversalAmount
                ));

                Long originalLedger = ledger.findByTenantIdAndChargeItemId(context.tenantId(), original.id())
                        .map(LedgerEntry::id).orElse(null);

                ledger.save(new LedgerEntry(
                        context.tenantId(), original.patientAccountId(), "CHARGE_REVERSAL", "CREDIT",
                        original.totalAmount().abs(), original.currencyCode(), reversal.id(),
                        null, null, originalLedger, now, context.subjectId()
                ));

                credited = credited.add(original.totalAmount());
            }
        }

        PaymentOrderView refundOrder = paymentOrchestration.refund(
                new PaymentOrchestrationService.CreateRefundOrderCommand(
                        paymentId, command.idempotencyKey(), refundAmount, command.reason(),
                        "DIRECT-REFUND-" + account.encounterId(), command.terminalCode()
                )
        );

        for (RefundItemPreCheckView item : itemsToCheck) {
            if ("MEDICATION_REQUEST".equals(item.sourceType()) && item.sourceId() != null) {
                cancelPharmacyFulfillment(context.tenantId(), item.sourceId());
            }
        }

        tryRedFlushFiscalReceipts(context.tenantId(), account.id(), command.idempotencyKey(), command.reason());

        return refundOrder;
    }

    private void cancelPharmacyFulfillment(Long tenantId, Long requestId) {
        try {
            pharmacy.cancelUnfulfilledForRefund(tenantId, requestId);
            log.info("Direct refund requested pharmacy cancellation for request {}", requestId);
        } catch (Exception ex) {
            log.warn("Downstream pharmacy cancellation failed for request {}: {}", requestId, ex.getMessage());
        }
    }

    private void tryRedFlushFiscalReceipts(Long tenantId, Long accountId, String idempotencyKey, String reason) {
        try {
            List<Settlement> accountSettlements = settlements
                    .findByTenantIdAndPatientAccountIdOrderByCreatedAtAscIdAsc(tenantId, accountId);
            for (Settlement s : accountSettlements) {
                List<Receipt> settlementReceipts = receipts
                        .findByTenantIdAndSettlementIdOrderByCreatedAtAscIdAsc(tenantId, s.id());
                for (Receipt r : settlementReceipts) {
                    if ("ISSUED".equals(r.status()) && !"RED_FLUSH".equals(r.receiptType())) {
                        Optional<Receipt> redOpt = receipts.findByTenantIdAndReversesReceiptId(tenantId, r.id());
                        if (redOpt.isEmpty()) {
                            String cmdCode = "RF-" + idempotencyKey;
                            receiptService.redFlush(r.id(), cmdCode, reason, null);
                            log.info("Direct refund triggered fiscal receipt red-flush for receipt {}", r.receiptNo());
                        }
                    }
                }
            }
        } catch (Exception ex) {
            log.warn("Fiscal receipt red-flush failed during direct refund: {}", ex.getMessage());
        }
    }
}
