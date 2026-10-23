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
import com.rhn.shared.idempotency.CommandCodes;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;

import static com.rhn.shared.api.BusinessErrors.badRequest;

/**
 * 门诊直接退费与协同逆向作废编排服务。
 * billing 仅通过 pharmacy.api 请求药房逆向处理，不再修改药房内部实体或仓储。
 */
@Service
public class DirectRefundApplicationService {
    private static final String REFUND_SUCCEEDED = "REFUNDED";
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
    private final com.rhn.billing.api.RefundDiagnosticDirectory diagnostics;
    private final ExecutionContextProvider contextProvider;
    private final SettlementReliefService relief;
    private final TransactionTemplate transactionTemplate;

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
                                          com.rhn.billing.api.RefundDiagnosticDirectory diagnostics,
                                          ExecutionContextProvider contextProvider,
                                          SettlementReliefService relief,
                                          PlatformTransactionManager transactionManager) {
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
        this.diagnostics = diagnostics;
        this.contextProvider = contextProvider;
        this.relief = relief;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
    }

    /**
     * 退费分三段：幂等重放直接返回；本地事务内完成校验、药房取消与额度准备并提交；渠道退款在任何事务之外调用
     * （外部调用不持有账户行锁，事务回滚也不会丢失已发生的渠道退款）。仅退款指令成功后才红冲发票；
     * 失败/处理中直接返回指令视图，处理中的后续完成走回调/恢复路径，不在此红冲。
     */
    public PaymentOrderView directRefund(Long paymentId, DirectRefundCommand command) {
        ExecutionContext context = contextProvider.requireCurrent();
        var existing = paymentOrchestration.findExistingRefund(
                new PaymentOrchestrationService.CreateRefundOrderCommand(
                        paymentId, command.idempotencyKey(), command.amount(), command.reason(),
                        null, command.terminalCode()));
        if (existing.isPresent()) return existing.get();

        ResolvedRefund resolved = transactionTemplate.execute(status -> prepareRefund(context, paymentId, command));
        PaymentOrderView refundOrder = paymentOrchestration.refund(
                new PaymentOrchestrationService.CreateRefundOrderCommand(
                        paymentId, command.idempotencyKey(), resolved.refundAmount(), command.reason(),
                        "DIRECT-REFUND-" + resolved.encounterId(), command.terminalCode()));
        if (REFUND_SUCCEEDED.equals(refundOrder.status())) {
            tryRedFlushFiscalReceipts(context.tenantId(), resolved.originalPayment(), resolved.refundAmount(),
                    command.idempotencyKey(), command.reason());
        }
        return refundOrder;
    }

    private ResolvedRefund prepareRefund(ExecutionContext context, Long paymentId, DirectRefundCommand command) {
        ResolvedRefund resolved = resolveRefundTarget(context, paymentId, command);
        PatientAccount account = resolved.account();

        // 账户不是退费前置条件：有账户时按其精确核验，无账户时由收费项/就诊聚合核验。
        RefundPreCheckSummaryView preCheck = preCheckService.preCheck(
                resolved.encounterId(), resolved.originalPayment().patientAccountId());

        // 未指定项目 = 全部非挂号项目：挂号费必须走退号流程，既不参与核验阻断，也不会被补额度时冲销；
        // 显式勾选挂号项仍按预检 allowed=false 以 REFUND_PRECHECK_BLOCKED 拒绝。
        boolean explicitTargets = command.chargeItemIds() != null && !command.chargeItemIds().isEmpty();
        Set<Long> targetItemIds = explicitTargets
                ? new HashSet<>(command.chargeItemIds())
                : preCheck.items().stream().filter(item -> !"REGISTRATION".equals(item.sourceType()))
                        .map(RefundItemPreCheckView::chargeItemId).collect(java.util.stream.Collectors.toSet());
        if (explicitTargets) {
            Set<Long> known = preCheck.items().stream().map(RefundItemPreCheckView::chargeItemId)
                    .collect(java.util.stream.Collectors.toSet());
            if (!known.containsAll(targetItemIds)) {
                throw badRequest("REFUND_CHARGE_ITEM_INVALID", "退费收费项不属于当前就诊账户");
            }
        }

        List<RefundItemPreCheckView> itemsToCheck = preCheck.items().stream()
                .filter(item -> targetItemIds.contains(item.chargeItemId()))
                .toList();

        assertPreCheckPasses(preCheck, itemsToCheck);
        diagnostics.requireUnexecutedForRefund(context.tenantId(), itemsToCheck.stream()
                .filter(item -> "SERVICE_REQUEST".equals(item.sourceType()) && item.sourceId() != null)
                .map(RefundItemPreCheckView::sourceId).toList());
        // 先停药房发药再放钱：最坏结果是患者有余额无药，不会既退款又发药。已发药会抛冲突并整体回滚。
        for (RefundItemPreCheckView item : itemsToCheck) {
            if ("MEDICATION_REQUEST".equals(item.sourceType()) && item.sourceId() != null) {
                pharmacy.cancelUnfulfilledForRefund(context.tenantId(), item.sourceId());
                log.info("Direct refund requested pharmacy cancellation for request {}", item.sourceId());
            }
        }
        if (account != null) {
            ensureSufficientCredit(context, account, resolved.refundAmount(), targetItemIds);
        }
        return resolved;
    }

    private ResolvedRefund resolveRefundTarget(ExecutionContext context, Long paymentId, DirectRefundCommand command) {
        if (paymentId == null) {
            throw new BusinessException("PAYMENT_ID_REQUIRED", "退款原支付记录ID不能为空", HttpStatus.BAD_REQUEST);
        }
        Payment originalPayment = payments.findByIdAndTenantId(paymentId, context.tenantId())
                .orElseThrow(() -> new BusinessException("PAYMENT_NOT_FOUND", "未找到对应的原支付记录", HttpStatus.NOT_FOUND));

        if (!"PAYMENT".equals(originalPayment.paymentType())) {
            throw new BusinessException("INVALID_ORIGINAL_PAYMENT", "只能针对正向支付记录办理退款", HttpStatus.CONFLICT);
        }

        PatientAccount account = accounts.findByIdAndTenantId(originalPayment.patientAccountId(), context.tenantId())
                .orElse(null);

        if (!context.hasWorkContext() || !context.canAccessOrganization(
                account == null ? originalPayment.organizationId() : account.organizationId())) {
            throw new BusinessException("BILLING_ACCOUNT_SCOPE_INVALID", "当前工作上下文不能访问该费用账户", HttpStatus.FORBIDDEN);
        }
        Long encounterId = account == null ? null : account.encounterId();
        if (encounterId == null) {
            encounterId = charges.findByTenantIdAndPatientAccountIdOrderByOccurredAtAscIdAsc(
                            context.tenantId(), originalPayment.patientAccountId()).stream()
                    .map(ChargeItem::encounterId).filter(Objects::nonNull).findFirst().orElse(null);
        }
        if (encounterId == null) {
            throw new BusinessException("REFUND_ENCOUNTER_REQUIRED", "原支付未关联就诊，无法办理直接退费", HttpStatus.CONFLICT);
        }
        BigDecimal refunded = payments.refundedForPayment(context.tenantId(), originalPayment.id());
        BigDecimal remainingRefundable = originalPayment.amount().subtract(refunded == null ? BigDecimal.ZERO : refunded);

        BigDecimal refundAmount = command.amount();
        if (refundAmount == null || refundAmount.signum() <= 0) {
            throw new BusinessException("REFUND_AMOUNT_INVALID", "退款金额必须大于零", HttpStatus.BAD_REQUEST);
        }
        if (refundAmount.compareTo(remainingRefundable) > 0) {
            throw new BusinessException("REFUND_AMOUNT_EXCEEDED", "退款金额不能超过原支付记录剩余可退金额", HttpStatus.CONFLICT);
        }
        return new ResolvedRefund(account, refundAmount, originalPayment, encounterId);
    }

    private void assertPreCheckPasses(RefundPreCheckSummaryView preCheck, List<RefundItemPreCheckView> itemsToCheck) {
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
    }

    private void ensureSufficientCredit(ExecutionContext context, PatientAccount account,
                                        BigDecimal refundAmount, Set<Long> targetItemIds) {
        BigDecimal currentBalance = ledger.balance(context.tenantId(), account.id());
        if (currentBalance == null) {
            currentBalance = BigDecimal.ZERO;
        }
        BigDecimal currentCredit = currentBalance.signum() < 0 ? currentBalance.abs() : BigDecimal.ZERO;

        if (refundAmount.compareTo(currentCredit) > 0) {
            topUpCreditByReversingCharges(context, account, refundAmount, currentCredit, targetItemIds);
        }
    }

    private void topUpCreditByReversingCharges(ExecutionContext context, PatientAccount account,
                                               BigDecimal refundAmount, BigDecimal currentCredit,
                                               Set<Long> targetItemIds) {
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

            credited = credited.add(reverseSingleCharge(context, account, original, now));
        }
    }

    /** 冲销收费事项并冲回其已享受的惠民减免；返回本次实际增加的可退金额（冲销原额 - 冲回减免）。 */
    private BigDecimal reverseSingleCharge(ExecutionContext context, PatientAccount account, ChargeItem original, Instant now) {
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

        BigDecimal relieved = relief.reverseForChargeReversals(context, account, List.of(reversal), null, null);
        return original.totalAmount().subtract(relieved);
    }

    private void tryRedFlushFiscalReceipts(Long tenantId, Payment originalPayment, BigDecimal refundAmount,
                                           String idempotencyKey, String reason) {
        // Legacy payments without an invoice have no unambiguous receipt target. Never fall back to the whole account.
        if (originalPayment.invoiceId() == null) return;
        var settlement = settlements.findByTenantIdAndLegacyInvoiceId(tenantId, originalPayment.invoiceId())
                .filter(value -> Objects.equals(value.patientAccountId(), originalPayment.patientAccountId()));
        if (settlement.isEmpty()) return;
        // 红冲会整张冲销票据，只有本次退款覆盖结算净额全额时才自动执行，部分退款转人工处理。
        BigDecimal settlementNet = settlement.get().netAmount();
        if (settlementNet == null || refundAmount.compareTo(settlementNet.abs()) < 0) {
            log.warn("Skip fiscal receipt red-flush for invoice {}: refund {} is partial against settlement net {}; manual handling required",
                    originalPayment.invoiceId(), refundAmount, settlementNet);
            return;
        }
        for (Receipt receipt : receipts.findByTenantIdAndSettlementIdOrderByCreatedAtAscIdAsc(tenantId, settlement.get().id())) {
            if (!"ISSUED".equals(receipt.status()) || "RED_FLUSH".equals(receipt.receiptType())) continue;
            BigDecimal receiptAmount = receipt.receiptAmount();
            if (receiptAmount == null || refundAmount.compareTo(receiptAmount.abs()) < 0) {
                log.warn("Skip fiscal receipt red-flush for receipt {}: refund {} does not cover receipt amount {}; manual handling required",
                        receipt.id(), refundAmount, receiptAmount);
                continue;
            }
            try {
                Optional<Receipt> red = receipts.findByTenantIdAndReversesReceiptId(tenantId, receipt.id());
                if (red.isEmpty()) {
                    String command = CommandCodes.prefixed("RF-", idempotencyKey + ":" + receipt.id());
                    receiptService.redFlush(receipt.id(), command, reason, null);
                    log.info("Direct refund triggered fiscal receipt red-flush for receipt {}", receipt.receiptNo());
                }
            } catch (Exception ex) {
                log.warn("Fiscal receipt red-flush failed during direct refund for receipt {}: {}", receipt.id(), ex.getMessage());
            }
        }
    }

    private record ResolvedRefund(PatientAccount account, BigDecimal refundAmount, Payment originalPayment,
                                  Long encounterId) {
    }
}
