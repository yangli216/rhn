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
import com.rhn.outpatient.api.EncounterDirectory;
import com.rhn.outpatient.api.EncounterDirectory.EncounterSnapshot;
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

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.forbidden;
import static com.rhn.shared.api.BusinessErrors.notFound;

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
    private final EncounterDirectory encounterDirectory;
    private final ExecutionContextProvider contextProvider;

    public RefundPreCheckService(PatientAccountRepository accounts,
                                 ChargeItemRepository charges,
                                 PaymentRepository payments,
                                 RefundPharmacyDirectory pharmacy,
                                 RefundDiagnosticDirectory diagnostics,
                                 RefundTreatmentDirectory treatment,
                                 RefundPolicy refundPolicy,
                                 EncounterDirectory encounterDirectory,
                                 ExecutionContextProvider contextProvider) {
        this.accounts = accounts;
        this.charges = charges;
        this.payments = payments;
        this.pharmacy = pharmacy;
        this.diagnostics = diagnostics;
        this.treatment = treatment;
        this.refundPolicy = refundPolicy;
        this.encounterDirectory = encounterDirectory;
        this.contextProvider = contextProvider;
    }

    public RefundPreCheckSummaryView preCheck(Long encounterId) {
        return preCheck(encounterId, null);
    }

    /**
     * 退费前置核验。账户仅作为收费项的记账载体：无账户、多个账户或账户未启用储值都不再阻断核验，
     * 传入 accountId 时优先按该账户精确核验；encounterId 缺失时先从账户/收费项反查就诊。
     */
    public RefundPreCheckSummaryView preCheck(Long encounterId, Long accountId) {
        ExecutionContext context = contextProvider.requireCurrent();
        if (!context.hasWorkContext()) {
            throw badRequest("BILLING_WORK_CONTEXT_REQUIRED", "收费操作必须选择工作机构");
        }
        PatientAccount requestedAccount = accountId == null ? null
                : accounts.findByIdAndTenantId(accountId, context.tenantId()).orElse(null);
        if (accountId != null && requestedAccount == null) {
            throw notFound("PATIENT_ACCOUNT_NOT_FOUND", "未找到患者费用账户");
        }
        if (requestedAccount != null && !context.canAccessOrganization(requestedAccount.organizationId())) {
            throw forbidden("BILLING_ACCOUNT_SCOPE_INVALID", "当前工作上下文不能访问该费用账户");
        }
        if (requestedAccount != null && encounterId != null && requestedAccount.encounterId() != null
                && !Objects.equals(requestedAccount.encounterId(), encounterId)) {
            throw badRequest("BILLING_ACCOUNT_ENCOUNTER_MISMATCH", "费用账户不属于当前就诊");
        }
        List<ChargeItem> requestedCharges = accountId == null ? List.of()
                : charges.findByTenantIdAndPatientAccountIdOrderByOccurredAtAscIdAsc(context.tenantId(), accountId);
        Long resolvedEncounterId = encounterId;
        if (resolvedEncounterId == null && requestedAccount != null) resolvedEncounterId = requestedAccount.encounterId();
        if (resolvedEncounterId == null) {
            resolvedEncounterId = requestedCharges.stream().map(ChargeItem::encounterId)
                    .filter(Objects::nonNull).findFirst().orElse(null);
        }
        if (resolvedEncounterId == null) {
            return new RefundPreCheckSummaryView(
                    null, accountId, false, "BLOCKED",
                    "原支付未关联就诊，无法核验退费项目", BigDecimal.ZERO, BigDecimal.ZERO,
                    requestedAccount == null || requestedAccount.currencyCode() == null
                            ? "CNY" : requestedAccount.currencyCode(), List.of(), List.of());
        }

        List<PatientAccount> matchingAccounts = accounts.findByTenantIdAndEncounterIdIn(
                context.tenantId(), List.of(resolvedEncounterId));
        List<PatientAccount> scopedAccounts;
        if (accountId == null) {
            scopedAccounts = requestedAccount == null ? matchingAccounts : List.of(requestedAccount);
        } else {
            scopedAccounts = matchingAccounts.stream().filter(value -> Objects.equals(value.id(), accountId)).toList();
            if (scopedAccounts.isEmpty() && requestedAccount != null
                    && Objects.equals(requestedAccount.encounterId(), resolvedEncounterId)) {
                scopedAccounts = List.of(requestedAccount);
            }
        }
        List<PatientAccount> accessibleAccounts = scopedAccounts.stream()
                .filter(account -> context.canAccessOrganization(account.organizationId())).toList();
        if (!scopedAccounts.isEmpty() && accessibleAccounts.isEmpty()) {
            throw forbidden("BILLING_ACCOUNT_SCOPE_INVALID", "当前工作上下文不能访问该费用账户");
        }

        List<ChargeItem> allCharges;
        List<Payment> paymentList;
        if (!scopedAccounts.isEmpty()) {
            allCharges = scopedAccounts.stream()
                    .flatMap(account -> charges.findByTenantIdAndPatientAccountIdOrderByOccurredAtAscIdAsc(
                            context.tenantId(), account.id()).stream())
                    .toList();
            paymentList = scopedAccounts.stream()
                    .flatMap(account -> payments.findByTenantIdAndPatientAccountIdOrderByPaidAtAscIdAsc(
                            context.tenantId(), account.id()).stream())
                    .toList();
        } else {
            Long encounterFilter = resolvedEncounterId;
            allCharges = accountId == null
                    ? charges.findByTenantIdAndEncounterIdOrderByOccurredAtAscIdAsc(context.tenantId(), resolvedEncounterId)
                    : requestedCharges.stream()
                            .filter(charge -> Objects.equals(charge.encounterId(), encounterFilter))
                            .toList();
            paymentList = List.of();
        }

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

        Long policyOrganizationId = accessibleAccounts.isEmpty()
                ? context.organizationId() : accessibleAccounts.get(0).organizationId();
        boolean unexecutedDirectRefundAllowed = refundPolicy.isUnexecutedDirectRefundAllowed(
                context, policyOrganizationId, null);

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

        // 挂号费项始终阻断（需走退号流程），不参与整单判定，避免把整单误导成"部分可退"。
        List<RefundItemPreCheckView> orderItems = items.stream()
                .filter(item -> !"REGISTRATION".equals(item.sourceType())).toList();
        boolean hasRegistration = orderItems.size() != items.size();
        boolean allAllowed = !orderItems.isEmpty() && orderItems.stream().allMatch(RefundItemPreCheckView::allowed);
        boolean anyAllowed = orderItems.stream().anyMatch(RefundItemPreCheckView::allowed);

        String overallDecision;
        String summaryNotice;

        if (items.isEmpty()) {
            overallDecision = "BLOCKED";
            summaryNotice = "当前就诊暂无可退费的收费项目。";
        } else if (orderItems.isEmpty()) {
            overallDecision = "BLOCKED";
            summaryNotice = "当前就诊仅有挂号费，挂号费请走退号流程。";
        } else if (allAllowed) {
            overallDecision = "ALLOWED";
            summaryNotice = hasRegistration ? "医嘱费用均可直接退费；挂号费不在此退还。"
                    : "所有收费项目均满足退费防损与协同校验要求，允许办理退款。";
        } else if (anyAllowed) {
            overallDecision = "PARTIAL";
            summaryNotice = "部分项目已发药、已执行或已出报告，仅未发药/未执行项目可直接退费。";
        } else {
            overallDecision = "BLOCKED";
            summaryNotice = "医嘱费用均已发药、已执行或已出报告，不能直接退费；已发药请先到药房退药。";
        }

        // 可退金额与支付剩余金额在退款指令中分别校验，这里不再要求必须先有账户支付候选。
        boolean eligibleForRefund = anyAllowed;
        Long resultAccountId = accountId != null ? accountId
                : (accessibleAccounts.size() == 1 ? accessibleAccounts.get(0).id() : null);
        String currency = accessibleAccounts.stream().map(PatientAccount::currencyCode).filter(Objects::nonNull)
                .findFirst()
                .orElseGet(() -> allCharges.stream().map(ChargeItem::currencyCode).filter(Objects::nonNull)
                        .findFirst()
                        .orElseGet(() -> paymentList.stream().map(Payment::currencyCode).filter(Objects::nonNull)
                                .findFirst().orElse("CNY")));

        return new RefundPreCheckSummaryView(
                resolvedEncounterId, resultAccountId, eligibleForRefund, overallDecision, summaryNotice,
                totalPaid, totalRefundable, currency, items, candidatePayments);
    }

    private RefundItemPreCheckView evaluateChargeItem(ExecutionContext context,
                                                       ChargeItem charge,
                                                       Set<Long> reversedChargeIds,
                                                       boolean unexecutedDirectRefundAllowed) {
        String sourceType = charge.sourceType() == null ? "" : charge.sourceType();
        Long sourceId = charge.sourceId();

        if (reversedChargeIds.contains(charge.id())) {
            return refundItem(charge, sourceType, sourceId,
                    "RETURNED", "已实物退药/已退费", true,
                    "已实物退药 · 允许退款", "info", null);
        }

        if ("REGISTRATION".equals(sourceType)) {
            return evaluateRegistration(charge, sourceType, sourceId);
        }

        if ("MEDICATION_REQUEST".equals(sourceType)) {
            return evaluateMedicationRequest(context, charge, sourceType, sourceId, unexecutedDirectRefundAllowed);
        }

        if ("SERVICE_REQUEST".equals(sourceType)) {
            return evaluateServiceRequest(context, charge, sourceType, sourceId, unexecutedDirectRefundAllowed);
        }

        return refundItem(charge, sourceType, sourceId,
                "OTHER", "就诊服务", true, "允许直接退款", "success", null);
    }

    /** 挂号费不在收费处直接退：未接诊走退号流程（返还号源），已接诊不予退还。 */
    private RefundItemPreCheckView evaluateRegistration(ChargeItem charge, String sourceType, Long sourceId) {
        String status = charge.encounterId() == null ? null
                : encounterDirectory.findOrganizationAccessible(List.of(charge.encounterId())).stream()
                        .findFirst().map(EncounterSnapshot::status).orElse(null);
        if ("REGISTERED".equals(status)) {
            return refundItem(charge, sourceType, sourceId,
                    "REGISTRATION_WITHDRAW", "未接诊", false,
                    "挂号费 · 请走退号", "warning",
                    "患者尚未接诊，挂号费请在挂号处办理退号（同时返还号源），不在收费处直接退费。");
        }
        return refundItem(charge, sourceType, sourceId,
                "REGISTRATION_IN_SERVICE", "已接诊", false,
                "已接诊 · 不可退号", "danger",
                "就诊已接诊或已开立医嘱，挂号费不予退还。");
    }

    private RefundItemPreCheckView evaluateMedicationRequest(ExecutionContext context, ChargeItem charge,
                                                            String sourceType, Long sourceId,
                                                            boolean unexecutedDirectRefundAllowed) {
        RefundPharmacyDirectory.RefundFulfillmentStatus fulfillment =
                pharmacy.statusForRequest(context.tenantId(), sourceId);
        if (fulfillment.dispensed()) {
            return refundItem(charge, sourceType, sourceId,
                    "DISPENSED", "已发药", false,
                    "已发药 · 阻断(需药房退药)", "danger",
                    "药房已发药出库，严禁直接退款！请先指引患者前往药房办理实物退药核收。");
        }
        // 已发药阻断优先；其余仍可退的用药再叠加治疗执行（注射/输液先发药后治疗）阻断。
        RefundItemPreCheckView executed = treatmentStartedBlock(context, charge, sourceType, sourceId);
        if (executed != null) return executed;
        if (fulfillment.returned()) {
            return refundItem(charge, sourceType, sourceId,
                    "RETURNED", "已退药", true,
                    "已实物退药 · 允许退款", "info", null);
        }

        if (unexecutedDirectRefundAllowed) {
            return refundItem(charge, sourceType, sourceId,
                    "UNDISPENSED", "未发药", true,
                    "未发药 · 允许直接退款", "success", null);
        }
        return refundItem(charge, sourceType, sourceId,
                "UNDISPENSED_NEED_CANCEL", "未发药(需作废)", false,
                "未发药 · 需医生先作废处方", "warning",
                "根据系统策略配置，未发药处方需先由开单医生在门诊工作站作废处方后方可退费。");
    }

    private RefundItemPreCheckView evaluateServiceRequest(ExecutionContext context, ChargeItem charge,
                                                          String sourceType, Long sourceId,
                                                          boolean unexecutedDirectRefundAllowed) {
        if (diagnostics.hasReportForRequest(context.tenantId(), sourceId)) {
            return refundItem(charge, sourceType, sourceId,
                    "REPORTED", "已出具报告", false,
                    "已出报告 · 阻断(需医技撤销)", "danger",
                    "检验检查已出具诊断报告，严禁直接退款！需由医技科室撤销执行或作废报告。");
        }
        if (diagnostics.hasExecutionForRequest(context.tenantId(), sourceId)) {
            return refundItem(charge, sourceType, sourceId, "EXECUTED", "已采集或已执行", false,
                    "已执行 · 需医技核对", "danger", "该申请已有实际采集或执行记录，不能作为未执行医嘱直接退费。");
        }
        RefundItemPreCheckView executed = treatmentStartedBlock(context, charge, sourceType, sourceId);
        if (executed != null) return executed;

        if (unexecutedDirectRefundAllowed) {
            return refundItem(charge, sourceType, sourceId,
                    "UNEXECUTED", "未出报告/未执行", true,
                    "未执行 · 允许直接退款", "success", null);
        }
        return refundItem(charge, sourceType, sourceId,
                "UNEXECUTED_NEED_CANCEL", "未执行(需作废)", false,
                "未执行 · 需医生先作废申请单", "warning",
                "根据系统策略配置，未执行检查申请单需先由开单医生作废后方可退费。");
    }

    /** 治疗执行已开始（含执行后异常、已处置）的医嘱不能在收费处直接退费，需由治疗科室处理。 */
    private RefundItemPreCheckView treatmentStartedBlock(ExecutionContext context, ChargeItem charge,
                                                         String sourceType, Long sourceId) {
        if (sourceId == null || !treatment.isExecutedOrInProgress(context.tenantId(), sourceType, sourceId)) return null;
        return refundItem(charge, sourceType, sourceId,
                "EXECUTED", "已执行", false,
                "已执行 · 阻断", "danger",
                "治疗已开始执行或已完成，严禁直接退款！需由治疗科室处理。");
    }

    private RefundItemPreCheckView refundItem(ChargeItem charge, String sourceType, Long sourceId,
                                              String decision, String itemStatus, boolean allowed,
                                              String notice, String tone, String blockReason) {
        return new RefundItemPreCheckView(
                charge.id(), sourceType, sourceId, charge.requestCode(),
                charge.itemNameSnapshot(), charge.itemCodeSnapshot(),
                charge.quantity(), charge.unitCode(), charge.totalAmount(),
                decision, itemStatus, allowed, notice, tone, blockReason);
    }
}
