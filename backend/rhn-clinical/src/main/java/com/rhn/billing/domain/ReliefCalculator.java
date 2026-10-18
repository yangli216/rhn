package com.rhn.billing.domain;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * 惠民减免计算引擎，纯函数、无数据访问：资格、额度余量和人工核准金额由调用方查好后传入。
 *
 * <p>每次计算处理一个时机：医保前以“原额 - 已有优惠”为基数和可减余额；医保后以剩余个人自付为基数
 * （政策可选是否包含个人账户），可减余额始终是尚未支付的现金自付。政策按优先级依次执行，后项按前项扣减后的余额计算。
 *
 * <p>单项实际减免 = min(原始减免, 可减余额, 单次上限, 周期剩余金额)；周期或项目次数用尽时不减免。
 * 政策合计按收费精度四舍五入且不超过上限，再按分摊权重拆到各行并以最大余数法补齐尾差，行合计恒等于政策合计。
 */
public final class ReliefCalculator {
    private static final int SCALE = 6;

    public Result calculate(Request request) {
        request.validate();
        Map<Long, LineState> states = new LinkedHashMap<>();
        for (ChargeLine line : request.lines()) states.put(line.lineId(), new LineState(line, request.timing()));
        List<PriorPolicy> executed = new ArrayList<>(request.priorPolicies());
        List<Outcome> outcomes = new ArrayList<>();
        List<Policy> ordered = request.policies().stream()
                .sorted(Comparator.comparingInt(Policy::priority).thenComparing(Policy::policyId)).toList();
        for (Policy policy : ordered) {
            Outcome outcome = calculatePolicy(request, policy, states, executed);
            outcomes.add(outcome);
            if (outcome.reliefAmount().signum() > 0) {
                executed.add(new PriorPolicy(policy.policyId(), policy.mutexGroup(), policy.stackable()));
                for (LineRelief line : outcome.lines()) states.get(line.lineId()).consume(line.reliefAmount());
            }
        }
        BigDecimal total = outcomes.stream().map(Outcome::reliefAmount).reduce(zero(), BigDecimal::add);
        Map<Long, BigDecimal> lineTotals = new LinkedHashMap<>();
        for (LineState state : states.values()) lineTotals.put(state.line.lineId(), state.relieved);
        return new Result(request.timing(), List.copyOf(outcomes), total, lineTotals);
    }

    private Outcome calculatePolicy(Request request, Policy policy, Map<Long, LineState> states,
                                    List<PriorPolicy> executed) {
        if (policy.timing() != request.timing()) return Outcome.skipped(policy, "减免时机不是本次计算阶段");
        if (!policy.eligible()) return Outcome.skipped(policy, Objects.requireNonNullElse(policy.ineligibleReason(), "不符合资格条件"));
        if (request.insured() && !policy.insuredApplicable()) return Outcome.skipped(policy, "政策不适用于医保结算患者");
        String conflict = combinationConflict(policy, executed);
        if (conflict != null) return Outcome.skipped(policy, conflict);
        if (policy.periodRemainingCount() != null && policy.periodRemainingCount() <= 0) {
            return Outcome.skipped(policy, "本周期享受次数已用完");
        }
        if (policy.periodRemainingAmount() != null && policy.periodRemainingAmount().signum() <= 0) {
            return Outcome.skipped(policy, "本周期减免额度已用完");
        }

        List<Candidate> candidates = new ArrayList<>();
        Set<String> notes = new LinkedHashSet<>();
        for (LineState state : states.values()) {
            Rule rule = match(policy, state.line);
            if (rule == null || rule.terms().excluded()) continue;
            if (rule.remainingCount() != null && rule.remainingCount() <= 0) {
                notes.add(scopeLabel(rule) + "本周期次数已用完");
                continue;
            }
            BigDecimal available = state.available();
            if (available.signum() <= 0) continue;
            candidates.add(new Candidate(state, rule, state.base(policy.baseIncludesPersonalAccount()), available));
        }
        if (candidates.isEmpty()) {
            return Outcome.skipped(policy, notes.isEmpty() ? "本次费用不在政策范围内" : String.join("；", notes));
        }

        BigDecimal manualTotal = request.manualAmounts().get(policy.policyId());
        boolean awaitingManual = false;
        Map<Candidate, BigDecimal> raw = new LinkedHashMap<>();
        Map<Rule, List<Candidate>> pooled = new LinkedHashMap<>();
        for (Candidate candidate : candidates) {
            ReliefRuleTerms terms = candidate.rule.terms();
            switch (terms.method()) {
                case RATIO -> raw.put(candidate, candidate.base.multiply(terms.ratio()));
                case FREE -> raw.put(candidate, candidate.base);
                case UNIT_AMOUNT -> raw.put(candidate, candidate.state.line.quantity().multiply(terms.amount()));
                case PRICE_CAP -> raw.put(candidate, candidate.base
                        .subtract(candidate.state.line.quantity().multiply(terms.amount())).max(BigDecimal.ZERO));
                case FIXED_AMOUNT, MANUAL -> pooled.computeIfAbsent(candidate.rule, key -> new ArrayList<>()).add(candidate);
            }
        }
        for (Map.Entry<Rule, List<Candidate>> pool : pooled.entrySet()) {
            ReliefRuleTerms terms = pool.getKey().terms();
            BigDecimal amount;
            if (terms.method() == ReliefMethod.FIXED_AMOUNT) amount = terms.amount();
            else if (manualTotal == null) { awaitingManual = true; continue; }
            else {
                amount = manualTotal;
                if (terms.manualMaxAmount() != null && amount.compareTo(terms.manualMaxAmount()) > 0) {
                    amount = terms.manualMaxAmount();
                    notes.add("人工核准金额已按上限 " + plain(terms.manualMaxAmount()) + " 元封顶");
                }
            }
            List<Candidate> members = pool.getValue();
            List<BigDecimal> shares = split(amount, members.stream().map(member -> member.base).toList(), SCALE);
            for (int index = 0; index < members.size(); index++) raw.put(members.get(index), shares.get(index));
        }

        BigDecimal rawTotal = zero();
        BigDecimal availableTotal = zero();
        BigDecimal baseTotal = zero();
        List<Candidate> applied = new ArrayList<>();
        for (Candidate candidate : candidates) {
            baseTotal = baseTotal.add(candidate.base);
            BigDecimal value = raw.get(candidate);
            if (value == null) continue;
            value = value.min(candidate.available).max(BigDecimal.ZERO).setScale(SCALE, RoundingMode.HALF_UP);
            raw.put(candidate, value);
            if (value.signum() == 0) continue;
            applied.add(candidate);
            rawTotal = rawTotal.add(value);
            availableTotal = availableTotal.add(candidate.available);
        }
        BigDecimal limit = availableTotal;
        if (policy.onceMaxAmount() != null && rawTotal.compareTo(policy.onceMaxAmount()) > 0) {
            notes.add("已按单次上限 " + plain(policy.onceMaxAmount()) + " 元封顶");
            limit = limit.min(policy.onceMaxAmount());
        }
        if (policy.periodRemainingAmount() != null && rawTotal.compareTo(policy.periodRemainingAmount()) > 0) {
            notes.add("已按周期剩余额度 " + plain(policy.periodRemainingAmount()) + " 元封顶");
            limit = limit.min(policy.periodRemainingAmount());
        }
        BigDecimal unit = request.precision();
        BigDecimal total = rawTotal.min(limit).divide(unit, 0, RoundingMode.HALF_UP).multiply(unit);
        BigDecimal ceiling = limit.divide(unit, 0, RoundingMode.FLOOR).multiply(unit)
                .min(applied.stream().map(candidate -> floor(candidate.available, unit)).reduce(zero(), BigDecimal::add));
        total = total.min(ceiling).setScale(SCALE, RoundingMode.HALF_UP);

        if (total.signum() <= 0) {
            if (awaitingManual) return Outcome.of(policy, OutcomeStatus.AWAITING_MANUAL, "待人工核准减免金额",
                    baseTotal, zero(), List.of(), Set.of());
            return Outcome.skipped(policy, notes.isEmpty() ? "本次无可减免金额" : String.join("；", notes));
        }
        List<BigDecimal> weights = applied.stream().map(raw::get).toList();
        List<BigDecimal> capacities = applied.stream().map(candidate -> candidate.available).toList();
        List<BigDecimal> amounts = allocate(total, weights, capacities, unit);
        List<LineRelief> lines = new ArrayList<>();
        Set<String> usedScopes = new LinkedHashSet<>();
        for (int index = 0; index < applied.size(); index++) {
            if (amounts.get(index).signum() == 0) continue;
            Candidate candidate = applied.get(index);
            lines.add(new LineRelief(candidate.state.line.lineId(), candidate.rule.ruleId(),
                    candidate.base.setScale(SCALE, RoundingMode.HALF_UP), amounts.get(index)));
            if (candidate.rule.terms().periodMaxCount() != null) usedScopes.add(candidate.rule.terms().scopeKey());
        }
        if (awaitingManual) notes.add("部分项目待人工核准");
        return Outcome.of(policy, OutcomeStatus.APPLIED, notes.isEmpty() ? null : String.join("；", notes),
                baseTotal.setScale(SCALE, RoundingMode.HALF_UP), total, List.copyOf(lines), usedScopes);
    }

    private String combinationConflict(Policy policy, List<PriorPolicy> executed) {
        for (PriorPolicy prior : executed) {
            if (prior.policyId().equals(policy.policyId())) return "本次结算已执行该政策";
            if (policy.mutexGroup() != null && policy.mutexGroup().equals(prior.mutexGroup())) {
                return "与同互斥组的已执行政策冲突";
            }
            if (!policy.stackable()) return "不允许与其他政策叠加";
            if (!prior.stackable()) return "已执行的政策不允许叠加";
        }
        return null;
    }

    /** 同一政策内取最精确的命中规则；精确度相同时排除优先，再按行号。 */
    private Rule match(Policy policy, ChargeLine line) {
        Rule best = null;
        for (Rule rule : policy.rules()) {
            ReliefRuleTerms terms = rule.terms();
            if (!terms.matches(line.catalogItemId(), line.accountingCategory(), line.sourceType())) continue;
            if (best == null || terms.specificity() > best.terms().specificity()
                    || (terms.specificity() == best.terms().specificity() && terms.excluded() && !best.terms().excluded())) {
                best = rule;
            }
        }
        return best;
    }

    private static String scopeLabel(Rule rule) {
        String name = rule.terms().scopeName();
        return name == null || name.isBlank() ? "项目" : "“" + name + "”";
    }

    /** 按权重拆分金额（不受精度约束），尾差落在最后一行。 */
    public static List<BigDecimal> split(BigDecimal amount, List<BigDecimal> weights, int scale) {
        BigDecimal weightTotal = weights.stream().reduce(BigDecimal.ZERO, BigDecimal::add);
        List<BigDecimal> result = new ArrayList<>();
        BigDecimal assigned = BigDecimal.ZERO;
        for (int index = 0; index < weights.size(); index++) {
            BigDecimal share = index == weights.size() - 1 ? amount.subtract(assigned)
                    : weightTotal.signum() == 0 ? BigDecimal.ZERO
                    : amount.multiply(weights.get(index)).divide(weightTotal, scale, RoundingMode.HALF_UP);
            result.add(share); assigned = assigned.add(share);
        }
        return result;
    }

    /**
     * 将已按精度取整的合计拆到各行：先按权重向下取整到精度单位，再把剩余单位依次补给小数余量最大且仍有容量的行。
     * 每行不超过其可减余额，合计严格等于 total。
     */
    public static List<BigDecimal> allocate(BigDecimal total, List<BigDecimal> weights, List<BigDecimal> capacities,
                                     BigDecimal unit) {
        int size = weights.size();
        BigDecimal weightTotal = weights.stream().reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal[] amounts = new BigDecimal[size];
        BigDecimal[] remainders = new BigDecimal[size];
        BigDecimal assigned = BigDecimal.ZERO;
        for (int index = 0; index < size; index++) {
            BigDecimal exact = total.multiply(weights.get(index)).divide(weightTotal, 12, RoundingMode.HALF_UP);
            BigDecimal floored = floor(exact, unit).min(floor(capacities.get(index), unit));
            amounts[index] = floored; remainders[index] = exact.subtract(floored);
            assigned = assigned.add(floored);
        }
        BigDecimal left = total.subtract(assigned);
        while (left.compareTo(unit) >= 0) {
            int pick = -1;
            for (int index = 0; index < size; index++) {
                if (amounts[index].add(unit).compareTo(floor(capacities.get(index), unit)) > 0) continue;
                if (pick < 0 || remainders[index].compareTo(remainders[pick]) > 0) pick = index;
            }
            if (pick < 0) throw new IllegalStateException("减免金额超过可分配余额");
            amounts[pick] = amounts[pick].add(unit); remainders[pick] = remainders[pick].subtract(unit);
            left = left.subtract(unit);
        }
        List<BigDecimal> result = new ArrayList<>();
        for (BigDecimal amount : amounts) result.add(amount.setScale(SCALE, RoundingMode.HALF_UP));
        return result;
    }

    private static BigDecimal floor(BigDecimal value, BigDecimal unit) {
        return value.divide(unit, 0, RoundingMode.FLOOR).multiply(unit);
    }

    private static String plain(BigDecimal value) { return value.stripTrailingZeros().toPlainString(); }
    private static BigDecimal zero() { return BigDecimal.ZERO.setScale(SCALE); }

    private static final class LineState {
        private final ChargeLine line;
        private final ReliefTiming timing;
        private BigDecimal relieved = zero();

        LineState(ChargeLine line, ReliefTiming timing) { this.line = line; this.timing = timing; }

        /** 医保前：原额 - 已有优惠；医保后：尚未支付的现金自付。 */
        BigDecimal available() {
            BigDecimal value = timing == ReliefTiming.PRE_INSURANCE
                    ? line.grossAmount().subtract(line.priorDiscount())
                    : line.patientCash().subtract(line.priorPostRelief());
            return value.subtract(relieved).max(BigDecimal.ZERO);
        }

        BigDecimal base(boolean includesPersonalAccount) {
            if (timing == ReliefTiming.PRE_INSURANCE || !includesPersonalAccount) return available();
            return available().add(line.personalAccount());
        }

        void consume(BigDecimal amount) { relieved = relieved.add(amount); }
    }

    private record Candidate(LineState state, Rule rule, BigDecimal base, BigDecimal available) {}

    /**
     * 一条结算行的计费事实。医保后阶段需提供 patientCash（净额 - 统筹 - 其他基金 - 个人账户）
     * 与 personalAccount；priorDiscount / priorPostRelief 为此前已落账的医保前优惠与医保后减免。
     */
    public record ChargeLine(Long lineId, Long catalogItemId, String accountingCategory, String sourceType,
                             BigDecimal quantity, BigDecimal grossAmount, BigDecimal priorDiscount,
                             BigDecimal patientCash, BigDecimal personalAccount, BigDecimal priorPostRelief) {
        public ChargeLine {
            Objects.requireNonNull(lineId, "lineId");
            quantity = nonNull(quantity); grossAmount = nonNull(grossAmount); priorDiscount = nonNull(priorDiscount);
            personalAccount = nonNull(personalAccount); priorPostRelief = nonNull(priorPostRelief);
            patientCash = patientCash == null ? grossAmount.subtract(priorDiscount).subtract(personalAccount) : patientCash;
        }

        /** 自费或医保前阶段：现金自付即为净额。 */
        public static ChargeLine selfPay(Long lineId, Long catalogItemId, String accountingCategory, String sourceType,
                                         BigDecimal quantity, BigDecimal grossAmount) {
            return new ChargeLine(lineId, catalogItemId, accountingCategory, sourceType, quantity, grossAmount,
                    null, null, null, null);
        }

        private static BigDecimal nonNull(BigDecimal value) { return value == null ? BigDecimal.ZERO : value; }
    }

    /** 规则及其项目级周期次数余量（null 表示不限）。 */
    public record Rule(Long ruleId, ReliefRuleTerms terms, Integer remainingCount) {
        public Rule { terms.validate(); }
    }

    /** 参与计算的政策版本快照、资格结论与周期余量（null 表示不限）。 */
    public record Policy(Long policyId, Long versionId, String name, ReliefTiming timing, int priority,
                         String mutexGroup, boolean stackable, boolean insuredApplicable,
                         boolean baseIncludesPersonalAccount, BigDecimal onceMaxAmount,
                         BigDecimal periodRemainingAmount, Integer periodRemainingCount, boolean eligible,
                         String ineligibleReason, List<Rule> rules) {
        public Policy { rules = List.copyOf(rules); }
    }

    /** 本结算此前阶段已执行的政策，用于跨阶段的互斥与叠加判断。 */
    public record PriorPolicy(Long policyId, String mutexGroup, boolean stackable) {}

    public record Request(ReliefTiming timing, boolean insured, BigDecimal precision, List<ChargeLine> lines,
                          List<Policy> policies, List<PriorPolicy> priorPolicies, Map<Long, BigDecimal> manualAmounts) {
        public Request {
            lines = List.copyOf(lines); policies = List.copyOf(policies);
            priorPolicies = priorPolicies == null ? List.of() : List.copyOf(priorPolicies);
            manualAmounts = manualAmounts == null ? Map.of() : Map.copyOf(manualAmounts);
        }

        void validate() {
            if (timing == null) throw new IllegalArgumentException("必须指定减免时机");
            if (precision == null || precision.signum() <= 0
                    || !BigInteger.ONE.equals(precision.stripTrailingZeros().unscaledValue())) {
                throw new IllegalArgumentException("收费精度必须为 10 的整数次幂，如 0.01");
            }
            Set<Long> ids = new LinkedHashSet<>();
            for (ChargeLine line : lines) if (!ids.add(line.lineId())) throw new IllegalArgumentException("结算行重复");
            for (BigDecimal amount : manualAmounts.values()) {
                if (amount == null || amount.signum() < 0) throw new IllegalArgumentException("人工核准金额不能为负");
            }
        }
    }

    public enum OutcomeStatus { APPLIED, SKIPPED, AWAITING_MANUAL }

    public record LineRelief(Long lineId, Long ruleId, BigDecimal baseAmount, BigDecimal reliefAmount) {}

    /** usedRuleScopes：本次产生减免、且设置了项目周期次数的规则范围键，各占用一次。 */
    public record Outcome(Long policyId, Long versionId, String policyName, OutcomeStatus status, String message,
                          BigDecimal baseAmount, BigDecimal reliefAmount, List<LineRelief> lines,
                          Set<String> usedRuleScopes) {
        static Outcome skipped(Policy policy, String reason) {
            return of(policy, OutcomeStatus.SKIPPED, reason, zero(), zero(), List.of(), Set.of());
        }

        static Outcome of(Policy policy, OutcomeStatus status, String message, BigDecimal base, BigDecimal relief,
                          List<LineRelief> lines, Set<String> scopes) {
            return new Outcome(policy.policyId(), policy.versionId(), policy.name(), status, message, base, relief,
                    lines, Set.copyOf(scopes));
        }
    }

    public record Result(ReliefTiming timing, List<Outcome> outcomes, BigDecimal totalRelief,
                         Map<Long, BigDecimal> lineTotals) {
        public List<Outcome> applied() {
            return outcomes.stream().filter(outcome -> outcome.status() == OutcomeStatus.APPLIED).toList();
        }
    }
}
