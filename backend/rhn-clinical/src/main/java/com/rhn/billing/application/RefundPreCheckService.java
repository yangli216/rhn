package com.rhn.billing.application;

import com.rhn.billing.api.RefundPreCheckViews.RefundItemPreCheckView;
import com.rhn.billing.api.RefundPreCheckViews.RefundPaymentCandidateView;
import com.rhn.billing.api.RefundPreCheckViews.RefundPreCheckSummaryView;
import com.rhn.billing.domain.ChargeItem;
import com.rhn.billing.domain.PatientAccount;
import com.rhn.billing.domain.Payment;
import com.rhn.billing.infrastructure.ChargeItemRepository;
import com.rhn.billing.infrastructure.PatientAccountRepository;
import com.rhn.billing.infrastructure.PaymentRepository;
import com.rhn.billing.api.RefundDiagnosticDirectory;
import com.rhn.pharmacy.api.RefundPharmacyDirectory;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.billing.api.RefundTreatmentDirectory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 门诊退费防损与协同审批前置检查服务。
 * 跨临床、药房、医技、处置状态校验通过各业务模块公开 API 完成，
 * billing 不再直接读取其它业务模块的 domain / repository。
 */
@Service
@Transactional(readOnly = true)
public class RefundPreCheckService {
    private final PatientAccountRepository accounts;
    private final ChargeItemRepository charges;
    private final PaymentRepository payments;
    private final RefundPharmacyDirectory pharmacy;
    private final RefundDiagnosticDirectory diagnostics;
    private final RefundTreatmentDirectory treatment;
    private final RefundPolicy refundPolicy;
    private final ExecutionContextProvider contextProvider;

    public RefundPreCheckService(PatientAccountRepository accounts,
                                 ChargeItemRepository charges,
                                 PaymentRepository payments,
                                 RefundPharmacyDirectory pharmacy,
                                 RefundDiagnosticDirectory diagnostics,
                                 RefundTreatmentDirectory treatment,
                                 RefundPolicy refundPolicy,
                                 ExecutionContextProvider contextProvider) {
        this.accounts = accounts;
        this.charges = charges;
        this.payments = payments;
        this.pharmacy = pharmacy;
        this.diagnostics = diagnostics;
        this.treatment = treatment;
        this.refundPolicy = refundPolicy;
        this.contextProvider = contextProvider;
    }

    public RefundPreCheckSummaryView preCheck(Long encounterId) {
        ExecutionContext context = contextProvider.requireCurrent();
        List<PatientAccount> matchingAccounts = accounts.findByTenantIdAndEncounterIdIn(
                context.tenantId(), List.of(encounterId));
        if (matchingAccounts.isEmpty()) {
            return new RefundPreCheckSummaryView(
                    encounterId, null, false, "BLOCKED",
                    "未检索到该就诊对应的有效费用账户", BigDecimal.ZERO, BigDecimal.ZERO,
                    "CNY", List.of(), List.of());
        }

        PatientAccount account = matchingAccounts.get(0);
        List<ChargeItem> allCharges = charges.findByTenantIdAndPatientAccountIdOrderByOccurredAtAscIdAsc(
                context.tenantId(), account.id());

        List<ChargeItem> positiveCharges = allCharges.stream()
                .filter(c -> c.totalAmount() != null && c.totalAmount().signum() > 0)
                .toList();
        List<ChargeItem> negativeCharges = allCharges.stream()
                .filter(c -> c.totalAmount() != null && c.totalAmount().signum() < 0)
                .toList();

        Set<Long> reversedChargeIds = negativeCharges.stream()
                .map(ChargeItem::reversesChargeItemId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());

        boolean unexecutedDirectRefundAllowed = refundPolicy.isUnexecutedDirectRefundAllowed(
                context, account.organizationId(), null);

        List<RefundItemPreCheckView> items = new ArrayList<>();
        BigDecimal totalRefundable = BigDecimal.ZERO;

        for (ChargeItem charge : positiveCharges) {
            RefundItemPreCheckView check = evaluateChargeItem(
                    context, charge, reversedChargeIds, unexecutedDirectRefundAllowed);
            items.add(check);
            if (check.allowed()) {
                totalRefundable = totalRefundable.add(charge.totalAmount());
            }
        }

        List<Payment> paymentList = payments.findByTenantIdAndPatientAccountIdOrderByPaidAtAscIdAsc(
                context.tenantId(), account.id());
        List<RefundPaymentCandidateView> candidatePayments = new ArrayList<>();
        BigDecimal totalPaid = BigDecimal.ZERO;

        for (Payment p : paymentList) {
            if ("PAYMENT".equals(p.paymentType())) {
                totalPaid = totalPaid.add(p.amount());
                BigDecimal refunded = payments.refundedForPayment(context.tenantId(), p.id());
                BigDecimal remaining = p.amount().subtract(refunded == null ? BigDecimal.ZERO : refunded);
                if (remaining.signum() > 0) {
                    candidatePayments.add(new RefundPaymentCandidateView(
                            p.id(), p.paymentNo(), p.paymentMethodCode(), p.amount(),
                            refunded == null ? BigDecimal.ZERO : refunded, remaining,
                            p.currencyCode(), p.paidAt()));
                }
            }
        }

        boolean allAllowed = !items.isEmpty() && items.stream().allMatch(RefundItemPreCheckView::allowed);
        boolean anyAllowed = items.stream().anyMatch(RefundItemPreCheckView::allowed);
        boolean hasItems = !items.isEmpty();

        String overallDecision;
        String summaryNotice;

        if (!hasItems) {
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
            summaryNotice = "所有收费项目均受协同防损策略阻断（药房已发药或医技已出具报告），禁止直接退款。";
        }

        boolean eligibleForRefund = anyAllowed && !candidatePayments.isEmpty();

        return new RefundPreCheckSummaryView(
                encounterId, account.id(), eligibleForRefund, overallDecision, summaryNotice,
                totalPaid, totalRefundable, account.currencyCode(), items, candidatePayments);
    }

    private RefundItemPreCheckView evaluateChargeItem(ExecutionContext context,
                                                       ChargeItem charge,
                                                       Set<Long> reversedChargeIds,
                                                       boolean unexecutedDirectRefundAllowed) {
        String sourceType = charge.sourceType() == null ? "" : charge.sourceType();
        Long sourceId = charge.sourceId();

        if (reversedChargeIds.contains(charge.id())) {
            return new RefundItemPreCheckView(
                    charge.id(), sourceType, sourceId, charge.requestCode(),
                    charge.itemNameSnapshot(), charge.itemCodeSnapshot(),
                    charge.quantity(), charge.unitCode(), charge.totalAmount(),
                    "RETURNED", "已实物退药/已退费", true,
                    "已实物退药 · 允许退款", "info", null);
        }

        if ("MEDICATION_REQUEST".equals(sourceType)) {
            RefundPharmacyDirectory.RefundFulfillmentStatus fulfillment =
                    pharmacy.statusForRequest(context.tenantId(), sourceId);
            if (fulfillment.dispensed()) {
                return new RefundItemPreCheckView(
                        charge.id(), sourceType, sourceId, charge.requestCode(),
                        charge.itemNameSnapshot(), charge.itemCodeSnapshot(),
                        charge.quantity(), charge.unitCode(), charge.totalAmount(),
                        "DISPENSED", "已发药", false,
                        "已发药 · 阻断(需药房退药)", "danger",
                        "药房已发药出库，严禁直接退款！请先指引患者前往药房办理实物退药核收。");
            }
            if (fulfillment.returned()) {
                return new RefundItemPreCheckView(
                        charge.id(), sourceType, sourceId, charge.requestCode(),
                        charge.itemNameSnapshot(), charge.itemCodeSnapshot(),
                        charge.quantity(), charge.unitCode(), charge.totalAmount(),
                        "RETURNED", "已退药", true,
                        "已实物退药 · 允许退款", "info", null);
            }

            if (unexecutedDirectRefundAllowed) {
                return new RefundItemPreCheckView(
                        charge.id(), sourceType, sourceId, charge.requestCode(),
                        charge.itemNameSnapshot(), charge.itemCodeSnapshot(),
                        charge.quantity(), charge.unitCode(), charge.totalAmount(),
                        "UNDISPENSED", "未发药", true,
                        "未发药 · 允许直接退款", "success", null);
            }
            return new RefundItemPreCheckView(
                    charge.id(), sourceType, sourceId, charge.requestCode(),
                    charge.itemNameSnapshot(), charge.itemCodeSnapshot(),
                    charge.quantity(), charge.unitCode(), charge.totalAmount(),
                    "UNDISPENSED_NEED_CANCEL", "未发药(需作废)", false,
                    "未发药 · 需医生先作废处方", "warning",
                    "根据系统策略配置，未发药处方需先由开单医生在门诊工作站作废处方后方可退费。");
        }

        if ("SERVICE_REQUEST".equals(sourceType)) {
            if (diagnostics.hasReportForRequest(context.tenantId(), sourceId)) {
                return new RefundItemPreCheckView(
                        charge.id(), sourceType, sourceId, charge.requestCode(),
                        charge.itemNameSnapshot(), charge.itemCodeSnapshot(),
                        charge.quantity(), charge.unitCode(), charge.totalAmount(),
                        "REPORTED", "已出具报告", false,
                        "已出报告 · 阻断(需医技撤销)", "danger",
                        "检验检查已出具诊断报告，严禁直接退款！需由医技科室撤销执行或作废报告。");
            }

            if (unexecutedDirectRefundAllowed) {
                return new RefundItemPreCheckView(
                        charge.id(), sourceType, sourceId, charge.requestCode(),
                        charge.itemNameSnapshot(), charge.itemCodeSnapshot(),
                        charge.quantity(), charge.unitCode(), charge.totalAmount(),
                        "UNEXECUTED", "未出报告/未执行", true,
                        "未执行 · 允许直接退款", "success", null);
            }
            return new RefundItemPreCheckView(
                    charge.id(), sourceType, sourceId, charge.requestCode(),
                    charge.itemNameSnapshot(), charge.itemCodeSnapshot(),
                    charge.quantity(), charge.unitCode(), charge.totalAmount(),
                    "UNEXECUTED_NEED_CANCEL", "未执行(需作废)", false,
                    "未执行 · 需医生先作废申请单", "warning",
                    "根据系统策略配置，未执行检查申请单需先由开单医生作废后方可退费。");
        }

        if ("TREATMENT".equals(sourceType)) {
            if (treatment.isExecutedOrInProgress(context.tenantId(), sourceId)) {
                return new RefundItemPreCheckView(
                        charge.id(), sourceType, sourceId, charge.requestCode(),
                        charge.itemNameSnapshot(), charge.itemCodeSnapshot(),
                        charge.quantity(), charge.unitCode(), charge.totalAmount(),
                        "EXECUTED", "已执行", false,
                        "已执行 · 阻断", "danger",
                        "治疗处置已在执行或已完成，严禁直接退款！需由处置科室处理。");
            }

            return new RefundItemPreCheckView(
                    charge.id(), sourceType, sourceId, charge.requestCode(),
                    charge.itemNameSnapshot(), charge.itemCodeSnapshot(),
                    charge.quantity(), charge.unitCode(), charge.totalAmount(),
                    "UNEXECUTED", "未执行", true,
                    "未执行 · 允许直接退款", "success", null);
        }

        return new RefundItemPreCheckView(
                charge.id(), sourceType, sourceId, charge.requestCode(),
                charge.itemNameSnapshot(), charge.itemCodeSnapshot(),
                charge.quantity(), charge.unitCode(), charge.totalAmount(),
                "OTHER", "就诊服务", true,
                "允许直接退款", "success", null);
    }
}
