package com.rhn.billing.domain;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ReliefDomainTest {
    static final Instant NOW = Instant.parse("2026-10-17T02:00:00Z");

    static ReliefPolicyVersion.Terms terms(ReliefQuotaPeriod period, String periodMax, LocalDate to) {
        return new ReliefPolicyVersion.Terms(ReliefTiming.POST_INSURANCE, ReliefSponsor.GOVERNMENT, "MZ", "民政局",
                "{\"scenes\":[\"OUTPATIENT\"]}", LocalDate.of(2026, 1, 1), to, 10, null, true,
                ReliefQualificationMode.ANY, true, false, new BigDecimal("200"), period,
                periodMax == null ? null : new BigDecimal(periodMax), null, true, false, null, null);
    }

    @Test void quota_keys_follow_period_and_share_settings() {
        LocalDate date = LocalDate.of(2026, 11, 3);
        assertThat(ReliefQuotaKey.periodKey(ReliefQuotaPeriod.YEAR, date)).isEqualTo("2026");
        assertThat(ReliefQuotaKey.periodKey(ReliefQuotaPeriod.QUARTER, date)).isEqualTo("2026-Q4");
        assertThat(ReliefQuotaKey.periodKey(ReliefQuotaPeriod.MONTH, date)).isEqualTo("2026-11");
        assertThat(ReliefQuotaKey.periodKey(ReliefQuotaPeriod.DAY, date)).isEqualTo("2026-11-03");
        assertThat(ReliefQuotaKey.periodKey(ReliefQuotaPeriod.POLICY_TERM, date)).isEqualTo("TERM");

        var separate = ReliefQuotaKey.of(1L, 2L, ReliefQuotaPeriod.YEAR, date, false, false, "REGISTRATION", 20L,
                ReliefQuotaKey.POLICY_SCOPE);
        var outpatient = ReliefQuotaKey.of(1L, 2L, ReliefQuotaPeriod.YEAR, date, false, false, "OUTPATIENT", 20L,
                ReliefQuotaKey.POLICY_SCOPE);
        var inpatient = ReliefQuotaKey.of(1L, 2L, ReliefQuotaPeriod.YEAR, date, false, false, "INPATIENT", 20L,
                ReliefQuotaKey.POLICY_SCOPE);
        assertThat(separate).isEqualTo(outpatient);
        assertThat(inpatient.shareKey()).isEqualTo("INPATIENT|ORG:20");
        assertThat(ReliefQuotaKey.of(1L, 2L, ReliefQuotaPeriod.YEAR, date, true, true, "INPATIENT", 20L, "POLICY")
                .shareKey()).isEqualTo("ANY|ANY");
    }

    @Test void quota_cannot_be_restored_below_zero() {
        var quota = new ReliefQuota(1L, new ReliefQuotaKey(1L, 2L, "2026", "ANY|ANY", "POLICY"), NOW);
        quota.change(new BigDecimal("150"), 1, NOW);
        quota.change(new BigDecimal("-50"), 0, NOW);
        assertThat(quota.usedAmount()).isEqualByComparingTo("100");
        assertThatThrownBy(() -> quota.change(new BigDecimal("-101"), -1, NOW)).isInstanceOf(IllegalStateException.class);
    }

    @Test void version_terms_validate_limits_and_publication_freezes_content() {
        assertThatThrownBy(() -> new ReliefPolicyVersion(1L, 2L, 1, terms(ReliefQuotaPeriod.NONE, "1000", null), 9L, NOW))
                .hasMessageContaining("额度周期");
        assertThatThrownBy(() -> new ReliefPolicyVersion(1L, 2L, 1,
                terms(ReliefQuotaPeriod.YEAR, "1000", LocalDate.of(2025, 12, 31)), 9L, NOW))
                .hasMessageContaining("失效日期");

        var policy = new ReliefPolicy(1L, "CIVIL", "民政救助", null, 9L, NOW);
        var version = new ReliefPolicyVersion(1L, policy.id(), 1, terms(ReliefQuotaPeriod.YEAR, "1000", null), 9L, NOW);
        assertThat(version.effectiveOn(LocalDate.of(2026, 10, 17))).isTrue();
        version.publish(9L, NOW);
        policy.publish(version, 9L, NOW);
        assertThat(policy.status()).isEqualTo(ReliefPolicyStatus.ACTIVE);
        assertThat(policy.currentVersionId()).isEqualTo(version.id());
        assertThatThrownBy(() -> version.revise(terms(ReliefQuotaPeriod.YEAR, "2000", null)))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test void application_reversal_is_bounded_and_marks_full_reversal() {
        var version = new ReliefPolicyVersion(1L, 2L, 1, terms(ReliefQuotaPeriod.YEAR, "1000", null), 9L, NOW);
        assertThatThrownBy(() -> new ReliefApplication(1L, 20L, 30L, 40L, version, "OUTPATIENT",
                new BigDecimal("50"), new BigDecimal("60"), null, null, "C1", 9L, NOW))
                .hasMessageContaining("不超过计算基数");
        var application = new ReliefApplication(1L, 20L, 30L, 40L, version, "OUTPATIENT", new BigDecimal("300"),
                new BigDecimal("100"), "{}", null, "C2", 9L, NOW);

        var partial = application.reverse(31L, new BigDecimal("40"), BigDecimal.ZERO, "R1", 9L, NOW);
        assertThat(partial.reliefAmount()).isEqualByComparingTo("-40");
        assertThat(partial.reversesApplicationId()).isEqualTo(application.id());
        assertThat(application.status()).isEqualTo(ReliefApplicationStatus.APPLIED);
        assertThatThrownBy(() -> application.reverse(31L, new BigDecimal("61"), new BigDecimal("40"), "R2", 9L, NOW))
                .hasMessageContaining("不超过原减免金额");
        assertThatThrownBy(() -> partial.reverse(32L, BigDecimal.ONE, BigDecimal.ZERO, "R3", 9L, NOW))
                .hasMessageContaining("冲销记录不能再次冲销");

        application.reverse(31L, new BigDecimal("60"), new BigDecimal("40"), "R4", 9L, NOW);
        assertThat(application.status()).isEqualTo(ReliefApplicationStatus.REVERSED);
        assertThatThrownBy(() -> new ReliefApplication.ManualApproval(" ", null, 9L)).hasMessageContaining("原因");
    }

    @Test void roster_validity_and_revocation() {
        var entry = new ReliefRosterEntry(1L, 20L, "FAMILY_DOCTOR_SIGNED", 40L, "张三", LocalDate.of(2026, 1, 1),
                LocalDate.of(2026, 12, 31), "QY-001", null, null, 9L, NOW);
        assertThat(entry.validOn(LocalDate.of(2026, 10, 17))).isTrue();
        assertThat(entry.validOn(LocalDate.of(2027, 1, 1))).isFalse();
        entry.revoke("签约解除", 9L, NOW);
        assertThat(entry.validOn(LocalDate.of(2026, 10, 17))).isFalse();
    }

    @Test void qualification_requires_source_specific_fields() {
        assertThatThrownBy(() -> new ReliefQualification(1L, 2L, 1, ReliefQualificationSource.ROSTER, null, null, null, null))
                .hasMessageContaining("资格类别");
        assertThatThrownBy(() -> new ReliefQualification(1L, 2L, 1, ReliefQualificationSource.PROVIDER,
                "PREGNANT_WOMAN", null, "MCH", null)).hasMessageContaining("失败处理");
        var provider = new ReliefQualification(1L, 2L, 1, ReliefQualificationSource.PROVIDER, "PREGNANT_WOMAN",
                null, "MCH", ReliefFailurePolicy.MANUAL_CONFIRM);
        assertThat(provider.failurePolicy()).isEqualTo(ReliefFailurePolicy.MANUAL_CONFIRM);
    }
}
