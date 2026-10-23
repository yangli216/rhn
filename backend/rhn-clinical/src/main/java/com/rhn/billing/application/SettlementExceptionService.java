package com.rhn.billing.application;

import com.rhn.billing.api.BillingViews.SettlementExceptionView;
import com.rhn.billing.api.BillingViews.SettlementRecordView;
import com.rhn.billing.domain.InsuranceClaim;
import com.rhn.billing.domain.PaymentOrder;
import com.rhn.billing.domain.Settlement;
import com.rhn.billing.domain.SettlementStatus;
import com.rhn.billing.infrastructure.InsuranceClaimRepository;
import com.rhn.billing.infrastructure.PaymentOrderRepository;
import com.rhn.billing.infrastructure.PaymentRepository;
import com.rhn.billing.infrastructure.SettlementRepository;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

import static com.rhn.shared.api.BusinessErrors.forbidden;

/**
 * 异常结算扫描：医保基金已落地而患者自付未收（单边账）、支付成功但业务未完成、医保结算结果不确定、
 * 支付结果长时间未知，以及超时未付款的结算单。纯推导、不落库：付清、取消或冲正后异常自动消失，
 * 处理动作复用既有的支付查询/业务完成重试/结算单取消入口。
 */
@Service
public class SettlementExceptionService {
    static final Set<SettlementStatus> OPEN = Set.of(SettlementStatus.PRICED, SettlementStatus.PAYMENT_PENDING, SettlementStatus.PARTIAL);
    private static final Set<String> ACTIVE_ORDER = Set.of("CREATED", "PENDING", "PROCESSING", "PARTIAL");
    private static final Duration LOOKBACK = Duration.ofDays(30);

    private final SettlementRepository settlements;
    private final InsuranceClaimRepository claims;
    private final PaymentOrderRepository orders;
    private final PaymentRepository payments;
    private final SettlementApplicationService settlementService;
    private final ExecutionContextProvider contextProvider;
    private final Clock clock;
    private final Duration timeout;
    private final Duration insuranceGrace;

    @org.springframework.beans.factory.annotation.Autowired
    public SettlementExceptionService(SettlementRepository settlements, InsuranceClaimRepository claims,
                                      PaymentOrderRepository orders, PaymentRepository payments,
                                      SettlementApplicationService settlementService,
                                      ExecutionContextProvider contextProvider,
                                      @Value("${rhn.billing.settlement-exception.timeout-minutes:10}") long timeoutMinutes,
                                      @Value("${rhn.billing.settlement-exception.insurance-grace-minutes:2}") long graceMinutes) {
        this(settlements, claims, orders, payments, settlementService, contextProvider, Clock.systemUTC(), timeoutMinutes, graceMinutes);
    }

    SettlementExceptionService(SettlementRepository settlements, InsuranceClaimRepository claims,
                               PaymentOrderRepository orders, PaymentRepository payments,
                               SettlementApplicationService settlementService,
                               ExecutionContextProvider contextProvider, Clock clock, long timeoutMinutes, long graceMinutes) {
        this.settlements = settlements; this.claims = claims; this.orders = orders; this.payments = payments;
        this.settlementService = settlementService; this.contextProvider = contextProvider; this.clock = clock;
        this.timeout = Duration.ofMinutes(Math.max(1, timeoutMinutes));
        this.insuranceGrace = Duration.ofMinutes(Math.max(0, graceMinutes));
    }

    @Transactional(readOnly = true)
    public List<SettlementExceptionView> exceptions(int limit) {
        ExecutionContext context = contextProvider.requireCurrent();
        if (!context.hasWorkContext()) throw forbidden("SETTLEMENT_QUERY_CONTEXT_REQUIRED", "收费查询需要机构工作上下文");
        Instant now = clock.instant();
        List<Settlement> open = settlements.findOpenSince(context.tenantId(), context.organizationId(), OPEN,
                now.minus(LOOKBACK), PageRequest.of(0, 500));
        if (open.isEmpty()) return List.of();
        Map<Long, SettlementRecordView> views = settlementService.recordViews(context, open).stream()
                .collect(Collectors.toMap(SettlementRecordView::id, Function.identity()));
        Map<Long, InsuranceClaim> claimBySettlement = claims.findByTenantIdAndSettlementIdIn(context.tenantId(),
                open.stream().map(Settlement::id).toList()).stream()
                .filter(claim -> !"REVERSED".equals(claim.status()))
                .collect(Collectors.toMap(InsuranceClaim::settlementId, Function.identity(),
                        (left, right) -> left.updatedAt().isAfter(right.updatedAt()) ? left : right));
        Collection<Long> invoiceIds = open.stream().map(Settlement::legacyInvoiceId).filter(java.util.Objects::nonNull).toList();
        Map<Long, List<PaymentOrder>> ordersByInvoice = invoiceIds.isEmpty() ? Map.of()
                : orders.findByTenantIdAndInvoiceIdIn(context.tenantId(), invoiceIds).stream()
                .filter(order -> "SETTLEMENT_PAY".equals(order.orderType()))
                .collect(Collectors.groupingBy(PaymentOrder::invoiceId));
        List<SettlementExceptionView> result = new ArrayList<>();
        for (Settlement settlement : open) {
            SettlementRecordView view = views.get(settlement.id());
            if (view == null) continue;
            var classified = classify(context, settlement, view, claimBySettlement.get(settlement.id()),
                    settlement.legacyInvoiceId() == null ? List.of() : ordersByInvoice.getOrDefault(settlement.legacyInvoiceId(), List.of()), now);
            if (classified != null) result.add(classified);
        }
        result.sort(Comparator.comparing((SettlementExceptionView value) -> "CRITICAL".equals(value.severity()) ? 0 : 1)
                .thenComparing(SettlementExceptionView::ageMinutes, Comparator.reverseOrder()));
        return result.stream().limit(Math.max(1, Math.min(limit, 500))).toList();
    }

    @Transactional(readOnly = true)
    public int count() { return exceptions(500).size(); }

    private SettlementExceptionView classify(ExecutionContext context, Settlement settlement, SettlementRecordView view,
                                             InsuranceClaim claim, List<PaymentOrder> orderList, Instant now) {
        BigDecimal paid = settlement.legacyInvoiceId() == null ? BigDecimal.ZERO
                : payments.netPaidForInvoice(context.tenantId(), settlement.legacyInvoiceId());
        BigDecimal outstanding = settlement.netAmount().subtract(paid == null ? BigDecimal.ZERO : paid)
                .subtract(settlementService.nonPaymentTendered(context, settlement.id())).max(BigDecimal.ZERO)
                .setScale(2, java.math.RoundingMode.HALF_UP);
        long age = Math.max(0, Duration.between(settlement.createdAt(), now).toMinutes());
        PaymentOrder succeeded = orderList.stream().filter(order -> "SUCCEEDED".equals(order.status()))
                .max(Comparator.comparing(PaymentOrder::updatedAt)).orElse(null);
        PaymentOrder active = orderList.stream().filter(order -> ACTIVE_ORDER.contains(order.status()))
                .min(Comparator.comparing(PaymentOrder::createdAt)).orElse(null);
        boolean insuranceSettled = claim != null && "SETTLED".equals(claim.status());
        boolean activeStale = active != null && Duration.between(active.createdAt(), now).compareTo(timeout) >= 0;
        boolean pastGrace = claim != null && Duration.between(claim.updatedAt(), now).compareTo(insuranceGrace) >= 0;

        if (succeeded != null) {
            return build(view, "PAID_NOT_COMPLETED", "支付已成功但结算未完成", "CRITICAL", outstanding, age, claim, succeeded,
                    List.of("RETRY_COMPLETION", "QUERY_PAYMENT"), "渠道已收款，结算单未更新为已完成：点击“业务完成重试”，仍失败请联系管理员核对流水。");
        }
        if (insuranceSettled && outstanding.signum() > 0 && pastGrace && (active == null || activeStale)) {
            return build(view, "INSURANCE_SETTLED_UNPAID", "医保已结算，自付未收（单边账）", "CRITICAL", outstanding, age, claim,
                    active, List.of("COLLECT", "QUERY_PAYMENT", "CANCEL_AND_REVERSE"),
                    "医保基金已扣，患者自付未收齐：优先联系患者补收；确认不再收款时，取消结算单并撤销医保。");
        }
        if (claim != null && !insuranceSettled && pastGrace && ("SETTLEMENT_PENDING".equals(claim.status())
                || "FAILED".equals(claim.status()) && "SETTLE".equals(claim.currentOperation()))) {
            return build(view, "INSURANCE_SETTLE_UNCERTAIN", "医保正式结算结果未确认", "CRITICAL", outstanding, age, claim, active,
                    List.of("QUERY_INSURANCE", "COLLECT"), "医保平台可能已扣款：先查询医保结算结果，再决定收款或撤销，避免单边账。");
        }
        if (activeStale) {
            return build(view, "PAYMENT_RESULT_UNKNOWN", "支付结果长时间未知", "WARNING", outstanding, age, claim, active,
                    List.of("QUERY_PAYMENT", "COLLECT"), "向渠道查询支付结果；渠道确认失败后可重新收款。");
        }
        boolean registration = "REGISTRATION".equals(settlement.settlementScene());
        if (!registration && active == null && age >= timeout.toMinutes()) {
            boolean partial = settlement.status() == SettlementStatus.PARTIAL;
            return build(view, "UNPAID_TIMEOUT", partial ? "部分付款，余款未收" : "结算单超时未付款", "WARNING", outstanding, age, claim, null,
                    List.of("COLLECT", "CANCEL"), partial ? "已收部分款项，请补收余款。" : "患者可能已离开：联系补收，或取消结算单让费用回到待结算。");
        }
        return null;
    }

    private SettlementExceptionView build(SettlementRecordView view, String type, String text, String severity,
                                          BigDecimal outstanding, long age, InsuranceClaim claim, PaymentOrder order,
                                          List<String> actions, String suggestion) {
        return new SettlementExceptionView(view, type, text, severity, outstanding, age,
                claim == null ? null : claim.id(), claim == null ? null : claim.status(),
                order == null ? null : order.id(), order == null ? null : order.status(), actions, suggestion);
    }
}
