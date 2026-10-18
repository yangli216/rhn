package com.rhn.billing.domain;

import com.rhn.billing.domain.ReliefCalculator.ChargeLine;
import com.rhn.billing.domain.ReliefCalculator.Outcome;
import com.rhn.billing.domain.ReliefCalculator.OutcomeStatus;
import com.rhn.billing.domain.ReliefCalculator.Policy;
import com.rhn.billing.domain.ReliefCalculator.PriorPolicy;
import com.rhn.billing.domain.ReliefCalculator.Request;
import com.rhn.billing.domain.ReliefCalculator.Result;
import com.rhn.billing.domain.ReliefCalculator.Rule;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static com.rhn.billing.domain.ReliefMethod.*;
import static com.rhn.billing.domain.ReliefScopeType.*;
import static com.rhn.billing.domain.ReliefTiming.POST_INSURANCE;
import static com.rhn.billing.domain.ReliefTiming.PRE_INSURANCE;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ReliefCalculatorTest {
    static final Long REGISTRATION_ITEM = 900L;
    static final Long GLUCOSE_ITEM = 901L;
    final ReliefCalculator calculator = new ReliefCalculator();

    static BigDecimal d(String value) { return new BigDecimal(value); }

    static ChargeLine line(long id, Long item, String category, String source, String quantity, String gross) {
        return ChargeLine.selfPay(id, item, category, source, d(quantity), d(gross));
    }

    /** 医保后行：净额、统筹与其他基金合计、个人账户。 */
    static ChargeLine insured(long id, String category, String net, String fund, String personalAccount) {
        BigDecimal cash = d(net).subtract(d(fund)).subtract(d(personalAccount));
        return new ChargeLine(id, null, category, "SERVICE_REQUEST", BigDecimal.ONE, d(net), null, cash,
                d(personalAccount), null);
    }

    static Rule rule(long id, ReliefRuleTerms terms) { return new Rule(id, terms, null); }

    static Rule all(long id, ReliefMethod method, String ratio, String amount) {
        return rule(id, ReliefRuleTerms.include(ALL, null, null, method, ratio == null ? null : d(ratio),
                amount == null ? null : d(amount)));
    }

    static PolicyBuilder policy(long id, ReliefTiming timing, Rule... rules) { return new PolicyBuilder(id, timing, rules); }

    Result run(ReliefTiming timing, boolean insured, List<ChargeLine> lines, Policy... policies) {
        return calculator.calculate(new Request(timing, insured, d("0.01"), lines, List.of(policies), List.of(), Map.of()));
    }

    static Outcome outcome(Result result, long policyId) {
        return result.outcomes().stream().filter(value -> value.policyId() == policyId).findFirst().orElseThrow();
    }

    static void assertBalanced(Result result) {
        for (Outcome outcome : result.outcomes()) {
            BigDecimal lines = outcome.lines().stream().map(ReliefCalculator.LineRelief::reliefAmount)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            assertThat(lines).isEqualByComparingTo(outcome.reliefAmount());
            assertThat(outcome.reliefAmount().stripTrailingZeros().scale()).isLessThanOrEqualTo(2);
        }
        BigDecimal byLine = result.lineTotals().values().stream().reduce(BigDecimal.ZERO, BigDecimal::add);
        assertThat(byLine).isEqualByComparingTo(result.totalRelief());
    }

    @Test void post_insurance_ratio_uses_remaining_self_pay_and_once_cap() {
        // 沟通稿示例：总费用 1000，医保支付 700，剩余自付 300；减免 50%、单次上限 100 元。
        var line = insured(1, "EXAM", "1000", "700", "0");
        var result = run(POST_INSURANCE, true, List.of(line),
                policy(1, POST_INSURANCE, all(11, RATIO, "0.5", null)).onceMax("100").build());
        assertThat(result.totalRelief()).isEqualByComparingTo("100");
        assertThat(outcome(result, 1).message()).contains("单次上限 100 元");
        assertThat(outcome(result, 1).baseAmount()).isEqualByComparingTo("300");

        var uncapped = run(POST_INSURANCE, true, List.of(line),
                policy(1, POST_INSURANCE, all(11, RATIO, "0.3", null)).onceMax("100").build());
        assertThat(uncapped.totalRelief()).isEqualByComparingTo("90");
        assertBalanced(result);
    }

    @Test void pre_insurance_free_item_only_relieves_the_matching_catalog_item() {
        var registration = line(1, REGISTRATION_ITEM, "REGISTRATION_FEE", "REGISTRATION", "1", "12");
        var drug = line(2, 300L, "WESTERN_DRUG", "MEDICATION_REQUEST", "2", "48.6");
        var result = run(PRE_INSURANCE, true, List.of(registration, drug),
                policy(1, PRE_INSURANCE, rule(11, ReliefRuleTerms.include(CATALOG_ITEM, null, REGISTRATION_ITEM,
                        FREE, null, null))).insuredApplicable(true).build());
        assertThat(result.totalRelief()).isEqualByComparingTo("12");
        assertThat(result.lineTotals()).containsEntry(1L, d("12.000000")).containsEntry(2L, d("0.000000"));
        assertThat(outcome(result, 1).lines()).singleElement()
                .satisfies(value -> assertThat(value.ruleId()).isEqualTo(11L));
    }

    @Test void category_exclusion_wins_over_all_but_a_specific_item_wins_over_its_category() {
        var exam = line(1, 100L, "EXAM", "SERVICE_REQUEST", "1", "200");
        var drug = line(2, 300L, "WESTERN_DRUG", "MEDICATION_REQUEST", "1", "100");
        var essentialDrug = line(3, 301L, "WESTERN_DRUG", "MEDICATION_REQUEST", "1", "40");
        var result = run(PRE_INSURANCE, false, List.of(exam, drug, essentialDrug),
                policy(1, PRE_INSURANCE,
                        all(11, RATIO, "0.5", null),
                        rule(12, ReliefRuleTerms.exclude(ACCOUNTING_CATEGORY, "WESTERN_DRUG", null)),
                        rule(13, ReliefRuleTerms.include(CATALOG_ITEM, null, 301L, RATIO, d("0.25"), null))).build());
        assertThat(result.lineTotals().get(1L)).isEqualByComparingTo("100");
        assertThat(result.lineTotals().get(2L)).isEqualByComparingTo("0");
        assertThat(result.lineTotals().get(3L)).isEqualByComparingTo("10");
        assertThat(result.totalRelief()).isEqualByComparingTo("110");
    }

    @Test void source_scope_matches_charge_origin() {
        var registration = line(1, 1L, "REGISTRATION_FEE", "REGISTRATION", "1", "10");
        var exam = line(2, 2L, "EXAM", "SERVICE_REQUEST", "1", "50");
        var result = run(PRE_INSURANCE, false, List.of(registration, exam), policy(1, PRE_INSURANCE,
                rule(11, ReliefRuleTerms.include(SOURCE_TYPE, "REGISTRATION", null, FREE, null, null))).build());
        assertThat(result.lineTotals().get(1L)).isEqualByComparingTo("10");
        assertThat(result.lineTotals().get(2L)).isEqualByComparingTo("0");
    }

    @Test void price_cap_and_unit_amount_follow_charged_quantity() {
        var glucose = line(1, GLUCOSE_ITEM, "LAB", "SERVICE_REQUEST", "3", "30");
        var injection = line(2, 500L, "TREATMENT", "SERVICE_REQUEST", "2", "15");
        var result = run(PRE_INSURANCE, false, List.of(glucose, injection), policy(1, PRE_INSURANCE,
                rule(11, ReliefRuleTerms.include(CATALOG_ITEM, null, GLUCOSE_ITEM, PRICE_CAP, null, d("1"))),
                rule(12, ReliefRuleTerms.include(CATALOG_ITEM, null, 500L, UNIT_AMOUNT, null, d("10")))).build());
        assertThat(result.lineTotals().get(1L)).isEqualByComparingTo("27");
        // 单位减免 2 × 10 = 20，超过本行 15 元时以可减余额为限。
        assertThat(result.lineTotals().get(2L)).isEqualByComparingTo("15");
    }

    @Test void fixed_amount_is_split_by_base_with_exact_cents() {
        var lines = List.of(line(1, 1L, "A", "SERVICE_REQUEST", "1", "10"),
                line(2, 2L, "A", "SERVICE_REQUEST", "1", "10"),
                line(3, 3L, "A", "SERVICE_REQUEST", "1", "10"));
        var result = run(POST_INSURANCE, false, lines, policy(1, POST_INSURANCE, all(11, FIXED_AMOUNT, null, "20")).build());
        assertThat(result.totalRelief()).isEqualByComparingTo("20");
        assertThat(outcome(result, 1).lines()).extracting(ReliefCalculator.LineRelief::reliefAmount)
                .allSatisfy(value -> assertThat(value.stripTrailingZeros().scale()).isLessThanOrEqualTo(2));
        assertBalanced(result);

        var exceeding = run(POST_INSURANCE, false, List.of(line(1, 1L, "A", "SERVICE_REQUEST", "1", "12.5")),
                policy(1, POST_INSURANCE, all(11, FIXED_AMOUNT, null, "200")).build());
        assertThat(exceeding.totalRelief()).isEqualByComparingTo("12.5");
    }

    @Test void ratio_rounds_half_up_to_cents_and_never_exceeds_line_capacity() {
        var lines = List.of(line(1, 1L, "A", "SERVICE_REQUEST", "1", "33.33"),
                line(2, 2L, "A", "SERVICE_REQUEST", "1", "33.33"),
                line(3, 3L, "A", "SERVICE_REQUEST", "1", "33.34"));
        var result = run(PRE_INSURANCE, false, lines, policy(1, PRE_INSURANCE, all(11, RATIO, "0.333333", null)).build());
        assertThat(result.totalRelief()).isEqualByComparingTo("33.33");
        assertBalanced(result);

        // 医保比例分摊后现金自付带 6 位小数：合计不超过各行可减余额按分取整之和。
        var fractional = List.of(insured(1, "A", "100", "66.666667", "0"), insured(2, "A", "100", "66.666667", "0"));
        var free = run(POST_INSURANCE, true, fractional,
                policy(1, POST_INSURANCE, all(11, FREE, null, null)).build());
        assertThat(free.totalRelief()).isEqualByComparingTo("66.66");
        assertBalanced(free);
    }

    @Test void period_quota_and_item_count_limit_the_relief() {
        var lines = List.of(line(1, 1L, "A", "SERVICE_REQUEST", "1", "500"));
        var capped = run(POST_INSURANCE, false, lines, policy(1, POST_INSURANCE, all(11, FREE, null, null))
                .periodRemaining("80", 3).build());
        assertThat(capped.totalRelief()).isEqualByComparingTo("80");
        assertThat(outcome(capped, 1).message()).contains("周期剩余额度 80 元");

        var exhausted = run(POST_INSURANCE, false, lines, policy(1, POST_INSURANCE, all(11, FREE, null, null))
                .periodRemaining(null, 0).build());
        assertThat(outcome(exhausted, 1).status()).isEqualTo(OutcomeStatus.SKIPPED);
        assertThat(outcome(exhausted, 1).message()).isEqualTo("本周期享受次数已用完");

        var checkup = ReliefRuleTerms.include(CATALOG_ITEM, null, 1L, FREE, null, null).withPeriodMaxCount(1);
        var named = new ReliefRuleTerms(checkup.scopeType(), null, 1L, "老年人体检", false, FREE, null, null, null, 1);
        var used = run(PRE_INSURANCE, false, lines, policy(1, PRE_INSURANCE, new Rule(11L, named, 0)).build());
        assertThat(outcome(used, 1).message()).isEqualTo("“老年人体检”本周期次数已用完");
        var available = run(PRE_INSURANCE, false, lines, policy(1, PRE_INSURANCE, new Rule(11L, named, 1)).build());
        assertThat(outcome(available, 1).usedRuleScopes()).containsExactly("CATALOG_ITEM:1");
    }

    @Test void stacked_policies_apply_in_priority_order_on_the_remaining_balance() {
        var lines = List.of(line(1, 1L, "A", "SERVICE_REQUEST", "1", "100"));
        var result = run(POST_INSURANCE, false, lines,
                policy(2, POST_INSURANCE, all(21, RATIO, "0.5", null)).priority(20).build(),
                policy(1, POST_INSURANCE, all(11, RATIO, "0.5", null)).priority(10).build());
        assertThat(outcome(result, 1).reliefAmount()).isEqualByComparingTo("50");
        assertThat(outcome(result, 2).reliefAmount()).isEqualByComparingTo("25");
        assertThat(result.outcomes()).extracting(Outcome::policyId).containsExactly(1L, 2L);
    }

    @Test void mutex_group_and_non_stackable_policies_block_later_ones() {
        var lines = List.of(line(1, 1L, "A", "SERVICE_REQUEST", "1", "100"));
        var mutex = run(POST_INSURANCE, false, lines,
                policy(1, POST_INSURANCE, all(11, RATIO, "0.3", null)).mutex("CIVIL").build(),
                policy(2, POST_INSURANCE, all(21, RATIO, "0.5", null)).priority(5).mutex("CIVIL").build());
        assertThat(outcome(mutex, 2).reliefAmount()).isEqualByComparingTo("50");
        assertThat(outcome(mutex, 1).message()).isEqualTo("与同互斥组的已执行政策冲突");

        var exclusive = run(POST_INSURANCE, false, lines,
                policy(1, POST_INSURANCE, all(11, RATIO, "0.3", null)).stackable(false).build(),
                policy(2, POST_INSURANCE, all(21, RATIO, "0.5", null)).priority(200).build());
        assertThat(outcome(exclusive, 2).message()).isEqualTo("已执行的政策不允许叠加");

        var prior = calculator.calculate(new Request(POST_INSURANCE, false, d("0.01"), lines,
                List.of(policy(2, POST_INSURANCE, all(21, RATIO, "0.5", null)).stackable(false).build()),
                List.of(new PriorPolicy(1L, null, true)), Map.of()));
        assertThat(outcome(prior, 2).message()).isEqualTo("不允许与其他政策叠加");
    }

    @Test void ineligible_insured_and_wrong_timing_policies_report_reasons() {
        var lines = List.of(line(1, 1L, "A", "SERVICE_REQUEST", "1", "100"));
        var result = run(PRE_INSURANCE, true, lines,
                policy(1, PRE_INSURANCE, all(11, FREE, null, null)).ineligible("名单资格已于 2026-09-30 到期").build(),
                policy(2, PRE_INSURANCE, all(21, FREE, null, null)).build(),
                policy(3, POST_INSURANCE, all(31, FREE, null, null)).build());
        assertThat(outcome(result, 1).message()).isEqualTo("名单资格已于 2026-09-30 到期");
        assertThat(outcome(result, 2).message()).isEqualTo("政策不适用于医保结算患者");
        assertThat(outcome(result, 3).message()).isEqualTo("减免时机不是本次计算阶段");
        assertThat(result.totalRelief()).isEqualByComparingTo("0");
    }

    @Test void manual_amount_waits_for_input_and_respects_the_configured_maximum() {
        var lines = List.of(line(1, 1L, "A", "SERVICE_REQUEST", "1", "300"), line(2, 2L, "B", "SERVICE_REQUEST", "1", "100"));
        var manual = rule(11, ReliefRuleTerms.include(ALL, null, null, MANUAL, null, null).withManualMaxAmount(d("200")));
        var waiting = run(POST_INSURANCE, false, lines, policy(1, POST_INSURANCE, manual).build());
        assertThat(outcome(waiting, 1).status()).isEqualTo(OutcomeStatus.AWAITING_MANUAL);

        var approved = calculator.calculate(new Request(POST_INSURANCE, false, d("0.01"), lines,
                List.of(policy(1, POST_INSURANCE, manual).build()), List.of(), Map.of(1L, d("500"))));
        assertThat(outcome(approved, 1).reliefAmount()).isEqualByComparingTo("200");
        assertThat(outcome(approved, 1).message()).contains("人工核准金额已按上限 200 元封顶");
        assertThat(approved.lineTotals().get(1L)).isEqualByComparingTo("150");
        assertThat(approved.lineTotals().get(2L)).isEqualByComparingTo("50");
    }

    @Test void post_insurance_base_may_include_personal_account_but_relief_stays_within_cash() {
        var lines = List.of(insured(1, "A", "300", "200", "40"));
        var excluded = run(POST_INSURANCE, true, lines, policy(1, POST_INSURANCE, all(11, RATIO, "0.5", null)).build());
        assertThat(excluded.totalRelief()).isEqualByComparingTo("30");
        var included = run(POST_INSURANCE, true, lines,
                policy(1, POST_INSURANCE, all(11, RATIO, "0.5", null)).personalAccountInBase().build());
        assertThat(included.totalRelief()).isEqualByComparingTo("50");
        var free = run(POST_INSURANCE, true, lines,
                policy(1, POST_INSURANCE, all(11, FREE, null, null)).personalAccountInBase().build());
        assertThat(free.totalRelief()).isEqualByComparingTo("60");
    }

    @Test void prior_discount_and_post_relief_reduce_what_remains() {
        var pre = new ChargeLine(1L, 1L, "A", "SERVICE_REQUEST", BigDecimal.ONE, d("100"), d("30"), null, null, null);
        var preResult = run(PRE_INSURANCE, false, List.of(pre), policy(1, PRE_INSURANCE, all(11, FREE, null, null)).build());
        assertThat(preResult.totalRelief()).isEqualByComparingTo("70");

        var post = new ChargeLine(1L, 1L, "A", "SERVICE_REQUEST", BigDecimal.ONE, d("100"), null, d("80"), null, d("50"));
        var postResult = run(POST_INSURANCE, false, List.of(post), policy(1, POST_INSURANCE, all(11, FREE, null, null)).build());
        assertThat(postResult.totalRelief()).isEqualByComparingTo("30");
    }

    @Test void nothing_in_scope_is_skipped_with_reason() {
        var result = run(PRE_INSURANCE, false, List.of(line(1, 1L, "A", "SERVICE_REQUEST", "1", "100")),
                policy(1, PRE_INSURANCE, rule(11, ReliefRuleTerms.include(CATALOG_ITEM, null, 2L, FREE, null, null))).build());
        assertThat(outcome(result, 1).status()).isEqualTo(OutcomeStatus.SKIPPED);
        assertThat(outcome(result, 1).message()).isEqualTo("本次费用不在政策范围内");
    }

    @Test void request_and_rule_terms_reject_invalid_configuration() {
        assertThatThrownBy(() -> calculator.calculate(new Request(PRE_INSURANCE, false, d("0.05"), List.of(),
                List.of(), List.of(), Map.of()))).hasMessageContaining("10 的整数次幂");
        assertThatThrownBy(() -> ReliefRuleTerms.include(ALL, null, null, RATIO, d("1.2"), null).validate())
                .hasMessageContaining("不超过 1");
        assertThatThrownBy(() -> new ReliefRuleTerms(ACCOUNTING_CATEGORY, "DRUG", null, null, true, FREE, null, null,
                null, null).validate()).hasMessageContaining("排除范围");
        assertThatThrownBy(() -> ReliefRuleTerms.exclude(ALL, null, null).validate()).hasMessageContaining("全部费用");
        assertThatThrownBy(() -> ReliefRuleTerms.include(CATALOG_ITEM, null, null, FREE, null, null).validate())
                .hasMessageContaining("收费项目");
        assertThatThrownBy(() -> ReliefRuleTerms.include(ALL, null, null, RATIO, d("0.5"), null)
                .withManualMaxAmount(d("10")).validate()).hasMessageContaining("仅人工核准");
    }

    static final class PolicyBuilder {
        final long id; final ReliefTiming timing; final List<Rule> rules;
        int priority = 100; String mutex; boolean stackable = true; boolean insuredApplicable = true;
        boolean personalAccount; BigDecimal onceMax; BigDecimal periodAmount; Integer periodCount;
        boolean eligible = true; String reason;

        PolicyBuilder(long id, ReliefTiming timing, Rule... rules) {
            this.id = id; this.timing = timing; this.rules = new ArrayList<>(List.of(rules));
            if (timing == PRE_INSURANCE) insuredApplicable = false;
        }
        PolicyBuilder priority(int value) { priority = value; return this; }
        PolicyBuilder mutex(String value) { mutex = value; return this; }
        PolicyBuilder stackable(boolean value) { stackable = value; return this; }
        PolicyBuilder insuredApplicable(boolean value) { insuredApplicable = value; return this; }
        PolicyBuilder personalAccountInBase() { personalAccount = true; return this; }
        PolicyBuilder onceMax(String value) { onceMax = d(value); return this; }
        PolicyBuilder periodRemaining(String amount, Integer count) {
            periodAmount = amount == null ? null : d(amount); periodCount = count; return this;
        }
        PolicyBuilder ineligible(String value) { eligible = false; reason = value; return this; }
        Policy build() {
            return new Policy(id, id * 10, "政策" + id, timing, priority, mutex, stackable, insuredApplicable,
                    personalAccount, onceMax, periodAmount, periodCount, eligible, reason, rules);
        }
    }
}
