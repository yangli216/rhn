package com.rhn.billing.application;

import com.rhn.billing.domain.CashierClose;
import com.rhn.billing.domain.CashierCloseEvent;
import com.rhn.billing.domain.CashierCloseItem;
import com.rhn.billing.domain.CashierCloseLine;
import com.rhn.billing.domain.Payment;
import com.rhn.billing.infrastructure.CashierCloseEventRepository;
import com.rhn.billing.infrastructure.CashierCloseItemRepository;
import com.rhn.billing.infrastructure.CashierCloseLineRepository;
import com.rhn.billing.infrastructure.CashierCloseRepository;
import com.rhn.billing.infrastructure.PaymentRepository;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.id.GlobalIds;
import com.rhn.platform.identityaccess.api.IdentityAccessDirectory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.forbidden;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class CashierCloseApplicationService {
    private static final DateTimeFormatter NUMBER_TIME = DateTimeFormatter.ofPattern("yyyyMMddHHmmss")
            .withZone(ZoneOffset.UTC);
    private final CashierCloseRepository closes;
    private final CashierCloseLineRepository lines;
    private final CashierCloseItemRepository items;
    private final CashierCloseEventRepository events;
    private final PaymentRepository payments;
    private final IdentityAccessDirectory users;
    private final ExecutionContextProvider contextProvider;

    public CashierCloseApplicationService(CashierCloseRepository closes, CashierCloseLineRepository lines,
                                          CashierCloseItemRepository items, CashierCloseEventRepository events,
                                          PaymentRepository payments, IdentityAccessDirectory users,
                                          ExecutionContextProvider contextProvider) {
        this.closes = closes; this.lines = lines; this.items = items; this.events = events;
        this.payments = payments; this.users = users; this.contextProvider = contextProvider;
    }

    @Transactional
    public CashierCloseView calculate(CalculateCommand input) {
        ExecutionContext context = requireContext();
        String commandCode = required(input.commandCode(), "CASHIER_CLOSE_COMMAND_REQUIRED", "日结幂等命令不能为空");
        CashierClose existing = closes.findByTenantIdAndCommandCode(context.tenantId(), commandCode).orElse(null);
        if (existing != null) {
            verifySame(existing, input);
            return view(existing, true);
        }
        if (!users.lockAccount(context.tenantId(), context.subjectId())) {
            throw forbidden("CASHIER_CLOSE_USER_INVALID", "当前收费员账号不存在");
        }
        existing = closes.findByTenantIdAndCommandCode(context.tenantId(), commandCode).orElse(null);
        if (existing != null) {
            verifySame(existing, input);
            return view(existing, true);
        }
        String terminalCode = required(input.terminalCode(), "CASHIER_CLOSE_TERMINAL_REQUIRED", "日结终端不能为空");
        Instant rangeFrom = Objects.requireNonNull(input.rangeFrom(), "rangeFrom");
        Instant rangeTo = Objects.requireNonNull(input.rangeTo(), "rangeTo");
        if (!rangeTo.isAfter(rangeFrom)) throw badRequest("CASHIER_CLOSE_RANGE_INVALID", "日结结束时间必须晚于开始时间");
        if (Duration.between(rangeFrom, rangeTo).compareTo(Duration.ofDays(31)) > 0) {
            throw badRequest("CASHIER_CLOSE_RANGE_TOO_LARGE", "单次日结范围不能超过31天");
        }
        if (!closes.findOverlapping(context.tenantId(), context.organizationId(), context.subjectId(), terminalCode,
                rangeFrom, rangeTo).isEmpty()) {
            throw conflict("CASHIER_CLOSE_RANGE_OVERLAP", "当前收费员和终端存在重叠的有效日结");
        }
        List<Payment> eligible = payments.findUnclosedForCashier(context.tenantId(), context.organizationId(),
                context.subjectId(), terminalCode, rangeFrom, rangeTo);
        String currency = eligible.stream().map(Payment::currencyCode).distinct().reduce((a, b) -> {
            throw conflict("CASHIER_CLOSE_MULTI_CURRENCY", "一次日结只能包含一个币种");
        }).orElse("CNY");
        Map<LineKey, Group> groups = new LinkedHashMap<>();
        for (Payment payment : eligible) {
            BigDecimal signed = "REFUND".equals(payment.paymentType()) ? money(payment.amount()).negate() : money(payment.amount());
            LineKey key = new LineKey(payment.paymentMethodCode(), payment.paymentType());
            groups.computeIfAbsent(key, ignored -> new Group()).add(signed);
        }
        Map<LineKey, BigDecimal> declared = declaredActuals(input.actualAmounts());
        BigDecimal expectedTotal = zero(); BigDecimal actualTotal = zero();
        record Draft(LineKey key, int count, BigDecimal expected, BigDecimal actual) {}
        java.util.ArrayList<Draft> drafts = new java.util.ArrayList<>();
        for (Map.Entry<LineKey, Group> entry : groups.entrySet()) {
            BigDecimal expected = money(entry.getValue().amount);
            BigDecimal actual;
            if ("CASH".equals(entry.getKey().paymentMethodCode())) {
                actual = declared.get(entry.getKey());
                if (actual == null) throw badRequest("CASHIER_CLOSE_CASH_ACTUAL_REQUIRED",
                        "现金支付和退款必须分别录入实盘金额");
            } else actual = expected;
            expectedTotal = expectedTotal.add(expected); actualTotal = actualTotal.add(actual);
            drafts.add(new Draft(entry.getKey(), entry.getValue().count, expected, actual));
        }
        expectedTotal = money(expectedTotal); actualTotal = money(actualTotal);
        String closeNo = "CC" + NUMBER_TIME.format(Instant.now()) + GlobalIds.randomSuffix(6);
        CashierClose close = closes.save(new CashierClose(context.tenantId(), context.organizationId(),
                context.subjectId(), null, closeNo, commandCode, terminalCode, "CALCULATED", rangeFrom, rangeTo,
                eligible.size(), expectedTotal, actualTotal, money(actualTotal.subtract(expectedTotal)), currency,
                context.subjectId()));
        int lineNo = 1;
        for (Draft draft : drafts) lines.save(new CashierCloseLine(context.tenantId(), close.id(), lineNo++,
                draft.key().paymentMethodCode(), draft.key().paymentType(), draft.count(), draft.expected(),
                draft.actual(), currency));
        int itemNo = 1;
        for (Payment payment : eligible) {
            BigDecimal signed = "REFUND".equals(payment.paymentType()) ? money(payment.amount()).negate() : money(payment.amount());
            items.save(new CashierCloseItem(context.tenantId(), close.id(), payment.id(), itemNo++, signed, currency));
        }
        events.save(new CashierCloseEvent(context.tenantId(), close.id(), "CALCULATE", null, "CALCULATED",
                commandCode, context.subjectId(), null));
        return view(close, false);
    }

    @Transactional
    public CashierCloseView confirm(Long closeId, ConfirmCommand input) {
        ExecutionContext context = requireContext();
        CashierClose close = lock(closeId, context);
        String commandCode = required(input.commandCode(), "CASHIER_CLOSE_CONFIRM_COMMAND_REQUIRED", "确认命令不能为空");
        if ("CONFIRMED".equals(close.status())) return view(close, true);
        if (!"CALCULATED".equals(close.status())) throw conflict("CASHIER_CLOSE_STATUS_INVALID", "只有已计算日结可以确认");
        String reason = clean(input.differenceReason());
        if (close.differenceAmount().signum() != 0 && reason == null) {
            throw badRequest("CASHIER_CLOSE_DIFFERENCE_REASON_REQUIRED", "日结存在实收差异，必须填写差异原因");
        }
        close.confirm(context.subjectId(), reason);
        events.save(new CashierCloseEvent(context.tenantId(), close.id(), "CONFIRM", "CALCULATED", "CONFIRMED",
                commandCode, context.subjectId(), reason));
        return view(close, false);
    }

    @Transactional
    public CashierCloseView reverse(Long closeId, ReverseCommand input) {
        ExecutionContext context = requireContext();
        String commandCode = required(input.commandCode(), "CASHIER_CLOSE_REVERSE_COMMAND_REQUIRED", "日结撤销命令不能为空");
        CashierClose existing = closes.findByTenantIdAndCommandCode(context.tenantId(), commandCode).orElse(null);
        if (existing != null) return view(existing, true);
        CashierClose original = lock(closeId, context);
        if (!"CONFIRMED".equals(original.status())) throw conflict("CASHIER_CLOSE_NOT_REVERSIBLE", "只有已确认日结可以撤销");
        String reason = required(input.reason(), "CASHIER_CLOSE_REVERSE_REASON_REQUIRED", "撤销日结必须填写原因");
        String closeNo = "CR" + NUMBER_TIME.format(Instant.now()) + GlobalIds.randomSuffix(6);
        CashierClose reversal = closes.save(new CashierClose(context.tenantId(), context.organizationId(),
                original.cashierUserId(), original.id(), closeNo, commandCode, original.terminalCode(), "CONFIRMED",
                original.rangeFrom(), original.rangeTo(), original.transactionCount(), original.expectedAmount().negate(),
                original.actualAmount().negate(), original.differenceAmount().negate(), original.currencyCode(),
                context.subjectId()));
        reversal.confirm(context.subjectId(), reason);
        int lineNo = 1;
        for (CashierCloseLine line : lines.findByTenantIdAndCashierCloseIdOrderByLineNo(context.tenantId(), original.id())) {
            lines.save(new CashierCloseLine(context.tenantId(), reversal.id(), lineNo++, line.paymentMethodCode(),
                    line.closeLineType(), line.transactionCount(), line.expectedAmount().negate(),
                    line.actualAmount().negate(), line.currencyCode()));
        }
        original.markReversed();
        events.save(new CashierCloseEvent(context.tenantId(), original.id(), "REVERSE", "CONFIRMED", "REVERSED",
                commandCode, context.subjectId(), reason));
        events.save(new CashierCloseEvent(context.tenantId(), reversal.id(), "REVERSE", null, "CONFIRMED",
                commandCode, context.subjectId(), reason));
        return view(reversal, false);
    }

    @Transactional(readOnly = true)
    public CashierCloseView get(Long closeId) {
        ExecutionContext context = requireContext();
        return view(require(closeId, context), false);
    }

    @Transactional(readOnly = true)
    public List<CashierCloseView> listMine() {
        ExecutionContext context = requireContext();
        return closes.findTop100ByTenantIdAndOrganizationIdAndCashierUserIdOrderByCreatedAtDesc(
                context.tenantId(), context.organizationId(), context.subjectId()).stream()
                .map(value -> view(value, false)).toList();
    }

    private CashierCloseView view(CashierClose close, boolean duplicate) {
        List<CashierCloseLineView> lineViews = lines.findByTenantIdAndCashierCloseIdOrderByLineNo(
                close.tenantId(), close.id()).stream().map(line -> new CashierCloseLineView(line.lineNo(),
                line.paymentMethodCode(), line.closeLineType(), line.transactionCount(), line.expectedAmount(),
                line.actualAmount(), line.differenceAmount(), line.currencyCode())).toList();
        return new CashierCloseView(close.id(), close.revision(), close.reversesCloseId(), close.closeNo(),
                close.commandCode(), close.organizationId(), close.cashierUserId(), close.terminalCode(), close.status(),
                close.rangeFrom(), close.rangeTo(), close.transactionCount(), close.expectedAmount(), close.actualAmount(),
                close.differenceAmount(), close.currencyCode(), close.differenceReason(), close.createdAt(),
                close.confirmedAt(), duplicate, lineViews);
    }

    private CashierClose lock(Long id, ExecutionContext context) {
        CashierClose close = closes.lockByIdAndTenantId(id, context.tenantId())
                .orElseThrow(() -> notFound("CASHIER_CLOSE_NOT_FOUND", "未找到收费员日结"));
        requireAccess(close, context); return close;
    }
    private CashierClose require(Long id, ExecutionContext context) {
        CashierClose close = closes.findByIdAndTenantId(id, context.tenantId())
                .orElseThrow(() -> notFound("CASHIER_CLOSE_NOT_FOUND", "未找到收费员日结"));
        requireAccess(close, context); return close;
    }
    private void requireAccess(CashierClose close, ExecutionContext context) {
        if (!Objects.equals(close.organizationId(), context.organizationId())
                || !Objects.equals(close.cashierUserId(), context.subjectId())) {
            throw forbidden("CASHIER_CLOSE_FORBIDDEN", "只能访问当前机构下本人的收费员日结");
        }
    }
    private void verifySame(CashierClose close, CalculateCommand input) {
        if (!Objects.equals(close.terminalCode(), clean(input.terminalCode()))
                || !Objects.equals(close.rangeFrom(), input.rangeFrom()) || !Objects.equals(close.rangeTo(), input.rangeTo())) {
            throw conflict("CASHIER_CLOSE_COMMAND_REUSED", "日结幂等命令已被不同范围或终端使用");
        }
    }
    private Map<LineKey, BigDecimal> declaredActuals(List<ActualAmount> values) {
        Map<LineKey, BigDecimal> result = new LinkedHashMap<>();
        if (values == null) return result;
        for (ActualAmount value : values) {
            LineKey key = new LineKey(upper(value.paymentMethodCode()), upper(value.paymentType()));
            if (key.paymentMethodCode() == null || key.paymentType() == null || value.amount() == null) {
                throw badRequest("CASHIER_CLOSE_ACTUAL_INVALID", "实盘金额的支付方式、类型和金额不能为空");
            }
            if (result.putIfAbsent(key, money(value.amount())) != null) {
                throw badRequest("CASHIER_CLOSE_ACTUAL_DUPLICATE", "同一支付方式和类型只能录入一条实盘金额");
            }
        }
        return result;
    }
    private ExecutionContext requireContext() {
        ExecutionContext context = contextProvider.requireCurrent();
        if (!context.hasWorkContext() || context.subjectId() == null) {
            throw forbidden("CASHIER_CLOSE_WORK_CONTEXT_REQUIRED", "日结前必须选择工作机构并登录收费员账号");
        }
        return context;
    }
    private BigDecimal zero() { return BigDecimal.ZERO.setScale(6); }
    private BigDecimal money(BigDecimal value) { return value.setScale(6, RoundingMode.HALF_UP); }
    private String clean(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    private String upper(String value) { String result = clean(value); return result == null ? null : result.toUpperCase(); }
    private String required(String value, String code, String message) {
        String result = clean(value); if (result == null) throw badRequest(code, message); return result;
    }

    private record LineKey(String paymentMethodCode, String paymentType) {}
    private static final class Group {
        private int count; private BigDecimal amount = BigDecimal.ZERO;
        private void add(BigDecimal value) { count++; amount = amount.add(value); }
    }
    public record ActualAmount(String paymentMethodCode, String paymentType, BigDecimal amount) {}
    public record CalculateCommand(String commandCode, String terminalCode, Instant rangeFrom, Instant rangeTo,
                                   List<ActualAmount> actualAmounts) {}
    public record ConfirmCommand(String commandCode, String differenceReason) {}
    public record ReverseCommand(String commandCode, String reason) {}
    public record CashierCloseLineView(int lineNo, String paymentMethodCode, String paymentType, int transactionCount,
                                       BigDecimal expectedAmount, BigDecimal actualAmount,
                                       BigDecimal differenceAmount, String currencyCode) {}
    public record CashierCloseView(Long id, long revision, Long reversesCloseId, String closeNo, String commandCode,
                                   Long organizationId, Long cashierUserId, String terminalCode, String status,
                                   Instant rangeFrom, Instant rangeTo, int transactionCount, BigDecimal expectedAmount,
                                   BigDecimal actualAmount, BigDecimal differenceAmount, String currencyCode,
                                   String differenceReason, Instant createdAt, Instant confirmedAt,
                                   boolean duplicate, List<CashierCloseLineView> lines) {}
}
