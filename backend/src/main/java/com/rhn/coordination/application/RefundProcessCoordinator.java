package com.rhn.coordination.application;

import com.rhn.billing.api.PaymentResultDirectory.PaymentOrderView;
import com.rhn.billing.api.RefundBillingDirectory;
import com.rhn.billing.api.RefundBillingDirectory.RefundBillingSnapshot;
import com.rhn.billing.api.RefundBillingDirectory.RefundChargeSnapshot;
import com.rhn.billing.api.RefundBillingDirectory.RefundPaymentContext;
import com.rhn.billing.api.RefundPreCheckViews.DirectRefundCommand;
import com.rhn.billing.api.RefundPreCheckViews.RefundItemPreCheckView;
import com.rhn.billing.api.RefundPreCheckViews.RefundPreCheckSummaryView;
import com.rhn.coordination.api.RefundCoordinationDirectory;
import com.rhn.diagnostics.api.RefundDiagnosticDirectory;
import com.rhn.pharmacy.api.RefundPharmacyDirectory;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.treatment.api.RefundTreatmentDirectory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Cross-domain outpatient refund process manager.
 *
 * Coordination owns the process decision and call order. Billing, pharmacy,
 * diagnostics and treatment keep their own invariants behind public APIs.
 */
@Service
public class RefundProcessCoordinator implements RefundCoordinationDirectory {
    private static final Logger log = LoggerFactory.getLogger(RefundProcessCoordinator.class);

    private final RefundBillingDirectory billing;
    private final RefundPharmacyDirectory pharmacy;
    private final RefundDiagnosticDirectory diagnostics;
    private final RefundTreatmentDirectory treatment;
    private final ExecutionContextProvider contextProvider;

    public RefundProcessCoordinator(RefundBillingDirectory billing,
                                    RefundPharmacyDirectory pharmacy,
                                    RefundDiagnosticDirectory diagnostics,
                                    RefundTreatmentDirectory treatment,
                                    ExecutionContextProvider contextProvider) {
        this.billing = billing;
        this.pharmacy = pharmacy;
        this.diagnostics = diagnostics;
        this.treatment = treatment;
        this.contextProvider = contextProvider;
    }

    @Override
    public RefundPreCheckSummaryView preCheck(Long encounterId) {
        ExecutionContext context = contextProvider.requireCurrent();
        RefundBillingSnapshot snapshot = billing.snapshotForEncounter(encounterId);
        if (snapshot.accountId() == null) {
            return new RefundPreCheckSummaryView(
                    encounterId, null, false, "BLOCKED",
                    "未检索到该就诊对应的有效费用账户", BigDecimal.ZERO, BigDecimal.ZERO,
                    snapshot.currencyCode(), List.of(), List.of());
        }

        List<RefundItemPreCheckView> items = new ArrayList<>();
        BigDecimal totalRefundable = BigDecimal.ZERO;
        for (RefundChargeSnapshot charge : snapshot.charges()) {
            RefundItemPreCheckView check = evaluateChargeItem(
                    context, charge, snapshot.unexecutedDirectRefundAllowed());
            items.add(check);
            if (check.allowed()) {
                totalRefundable = totalRefundable.add(charge.totalAmount());
            }
        }

        boolean allAllowed = !items.isEmpty() && items.stream().allMatch(RefundItemPreCheckView::allowed);
        boolean anyAllowed = items.stream().anyMatch(RefundItemPreCheckView::allowed);

        String overallDecision;
        String summaryNotice;
        if (items.isEmpty()) {
            overallDecision = "BLOCKED";
            summaryNotice = "当前就诊暂无可退费的收费项目。";
        } else if (allAllowed) {
            overallDecision = "ALLOWED";
            summaryNotice = "所有收费项目均满足退费防损与协同校验要求，允许办理退款。";
        } else if (anyAllowed) {
            overallDecision = "PARTIAL";
            summaryNotice = "部分项目已发药或已出报告，受协同防损策略阻断；未发药未执行项目允许直接退款。";
        } else {
            overallDecision = "BLOCKED";
            summaryNotice = "所有收费项目均受协同防损策略阻断（药房已发药、医技已出报告或处置已执行），禁止直接退款。";
        }

        boolean eligibleForRefund = anyAllowed && !snapshot.refundablePayments().isEmpty();
        return new RefundPreCheckSummaryView(
                encounterId, snapshot.accountId(), eligibleForRefund, overallDecision, summaryNotice,
                snapshot.totalPaidAmount(), totalRefundable, snapshot.currencyCode(),
                items, snapshot.refundablePayments());
    }

    @Override
    public PaymentOrderView directRefund(Long paymentId, DirectRefundCommand command) {
        RefundPaymentContext paymentContext = billing.paymentContext(paymentId);
        RefundPreCheckSummaryView preCheck = preCheck(paymentContext.encounterId());

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
                    .reduce((left, right) -> left + "；" + right)
                    .orElse("存在阻断项");
            throw new BusinessException(
                    "REFUND_PRECHECK_BLOCKED", "退费前置校验阻断：" + reasons, HttpStatus.CONFLICT);
        }

        if (!preCheck.eligibleForRefund()) {
            throw new BusinessException(
                    "REFUND_PRECHECK_BLOCKED",
                    "退费前置校验阻断：" + (preCheck.summaryNotice() != null
                            ? preCheck.summaryNotice() : "当前就诊不满足退费条件"),
                    HttpStatus.CONFLICT);
        }

        PaymentOrderView refundOrder = billing.executeDirectRefund(paymentId, command);
        ExecutionContext context = contextProvider.requireCurrent();
        for (RefundItemPreCheckView item : itemsToCheck) {
            if ("MEDICATION_REQUEST".equals(item.sourceType()) && item.sourceId() != null) {
                cancelPharmacyAfterRefund(context.tenantId(), item.sourceId());
            }
        }
        return refundOrder;
    }

    private RefundItemPreCheckView evaluateChargeItem(ExecutionContext context,
                                                       RefundChargeSnapshot charge,
                                                       boolean unexecutedDirectRefundAllowed) {
        String sourceType = charge.sourceType() == null ? "" : charge.sourceType();
        Long sourceId = charge.sourceId();

        if (charge.reversed()) {
            return item(charge, "RETURNED", "已实物退药/已退费", true,
                    "已实物退药 · 允许退款", "info", null);
        }

        if ("MEDICATION_REQUEST".equals(sourceType)) {
            RefundPharmacyDirectory.RefundFulfillmentStatus fulfillment = sourceId == null
                    ? RefundPharmacyDirectory.RefundFulfillmentStatus.undispensed("NO_SOURCE")
                    : pharmacy.statusForRequest(context.tenantId(), sourceId);
            if (fulfillment.dispensed()) {
                return item(charge, "DISPENSED", "已发药", false,
                        "已发药 · 阻断(需药房退药)", "danger",
                        "药房已发药出库，严禁直接退款！请先指引患者前往药房办理实物退药核收。");
            }
            if (fulfillment.returned()) {
                return item(charge, "RETURNED", "已退药", true,
                        "已实物退药 · 允许退款", "info", null);
            }
            if (unexecutedDirectRefundAllowed) {
                return item(charge, "UNDISPENSED", "未发药", true,
                        "未发药 · 允许直接退款", "success", null);
            }
            return item(charge, "UNDISPENSED_NEED_CANCEL", "未发药(需作废)", false,
                    "未发药 · 需医生先作废处方", "warning",
                    "根据系统策略配置，未发药处方需先由开单医生在门诊工作站作废处方后方可退费。");
        }

        if ("SERVICE_REQUEST".equals(sourceType)) {
            if (sourceId != null && diagnostics.hasReportForRequest(context.tenantId(), sourceId)) {
                return item(charge, "REPORTED", "已出具报告", false,
                        "已出报告 · 阻断(需医技撤销)", "danger",
                        "检验检查已出具诊断报告，严禁直接退款！需由医技科室撤销执行或作废报告。");
            }
            if (unexecutedDirectRefundAllowed) {
                return item(charge, "UNEXECUTED", "未出报告/未执行", true,
                        "未执行 · 允许直接退款", "success", null);
            }
            return item(charge, "UNEXECUTED_NEED_CANCEL", "未执行(需作废)", false,
                    "未执行 · 需医生先作废申请单", "warning",
                    "根据系统策略配置，未执行检查申请单需先由开单医生作废后方可退费。");
        }

        if ("TREATMENT".equals(sourceType)) {
            if (sourceId != null && treatment.isExecutedOrInProgress(context.tenantId(), sourceId)) {
                return item(charge, "EXECUTED", "已执行", false,
                        "已执行 · 阻断", "danger",
                        "治疗处置已在执行或已完成，严禁直接退款！需由处置科室处理。");
            }
            return item(charge, "UNEXECUTED", "未执行", true,
                    "未执行 · 允许直接退款", "success", null);
        }

        return item(charge, "OTHER", "就诊服务", true,
                "允许直接退款", "success", null);
    }

    private RefundItemPreCheckView item(RefundChargeSnapshot charge,
                                        String executionStatusCode,
                                        String executionStatusName,
                                        boolean allowed,
                                        String statusBadgeText,
                                        String statusTone,
                                        String blockReason) {
        return new RefundItemPreCheckView(
                charge.chargeItemId(), charge.sourceType(), charge.sourceId(), charge.documentNo(),
                charge.itemName(), charge.itemCode(), charge.quantity(), charge.unitCode(),
                charge.totalAmount(), executionStatusCode, executionStatusName, allowed,
                statusBadgeText, statusTone, blockReason);
    }

    private void cancelPharmacyAfterRefund(Long tenantId, Long requestId) {
        try {
            pharmacy.cancelUnfulfilledForRefund(tenantId, requestId);
            log.info("Refund coordination requested pharmacy cancellation for request {}", requestId);
        } catch (Exception ex) {
            // Preserve the existing best-effort downstream behavior. A later hardening step
            // should persist this command via integration/outbox for retry and observability.
            log.warn("Refund completed but pharmacy cancellation failed for request {}: {}",
                    requestId, ex.getMessage());
        }
    }
}
