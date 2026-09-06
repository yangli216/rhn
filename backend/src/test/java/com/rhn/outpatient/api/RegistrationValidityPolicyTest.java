package com.rhn.outpatient.api;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RegistrationValidityPolicyTest {
    private static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");

    @Test
    @DisplayName("默认模式 END_OF_DAY：1天有效期截止到挂号当天23:59:59（次日0点）")
    void defaultEndOfDayModeCutoff() {
        RegistrationValidityPolicy policy = new RegistrationValidityPolicy(null, "1", "END_OF_DAY");

        // 2026-09-06 09:30:00 挂号
        LocalDateTime regLdt = LocalDateTime.of(2026, 9, 6, 9, 30, 0);
        Instant regAt = regLdt.atZone(ZONE).toInstant();

        Instant cutoff = policy.calculateCutoffTime(regAt, 1L, 10L, 100L);
        // 截止时间应为 2026-09-07 00:00:00
        Instant expected = LocalDate.of(2026, 9, 7).atStartOfDay(ZONE).toInstant();
        assertEquals(expected, cutoff);

        // 同一天 23:59:58 在效期内
        Instant sameDayNight = LocalDateTime.of(2026, 9, 6, 23, 59, 58).atZone(ZONE).toInstant();
        assertTrue(policy.isValid(regAt, sameDayNight, 1L, 10L, 100L));
        assertFalse(policy.isExpired(regAt, sameDayNight, 1L, 10L, 100L));

        // 次日 00:00:01 已过期
        Instant nextDay = LocalDateTime.of(2026, 9, 7, 0, 0, 1).atZone(ZONE).toInstant();
        assertFalse(policy.isValid(regAt, nextDay, 1L, 10L, 100L));
        assertTrue(policy.isExpired(regAt, nextDay, 1L, 10L, 100L));
    }

    @Test
    @DisplayName("精确时长模式 EXACT_DURATION：1天有效期截止到挂号时刻的24小时后")
    void exactDurationModeCutoff() {
        RegistrationValidityPolicy policy = new RegistrationValidityPolicy(null, "1", "EXACT_DURATION");

        // 2026-09-06 14:15:30 挂号
        LocalDateTime regLdt = LocalDateTime.of(2026, 9, 6, 14, 15, 30);
        Instant regAt = regLdt.atZone(ZONE).toInstant();

        Instant cutoff = policy.calculateCutoffTime(regAt, 1L, 10L, 100L);
        // 截止时间应为 2026-09-07 14:15:30
        Instant expected = regAt.plus(1, ChronoUnit.DAYS);
        assertEquals(expected, cutoff);

        // 23小时后（2026-09-07 13:15:30）仍然在效期内
        Instant within24Hours = regAt.plus(23, ChronoUnit.HOURS);
        assertTrue(policy.isValid(regAt, within24Hours, 1L, 10L, 100L));

        // 24小时零1分后（2026-09-07 14:16:30）已过期
        Instant after24Hours = regAt.plus(24, ChronoUnit.HOURS).plus(1, ChronoUnit.MINUTES);
        assertFalse(policy.isValid(regAt, after24Hours, 1L, 10L, 100L));
        assertTrue(policy.isExpired(regAt, after24Hours, 1L, 10L, 100L));
    }

    @Test
    @DisplayName("多天有效期：设置3天有效期")
    void multiDayValidity() {
        RegistrationValidityPolicy policy = new RegistrationValidityPolicy(null, "3", "END_OF_DAY");

        LocalDateTime regLdt = LocalDateTime.of(2026, 9, 6, 10, 0, 0);
        Instant regAt = regLdt.atZone(ZONE).toInstant();

        Instant cutoff = policy.calculateCutoffTime(regAt, 1L, 10L, 100L);
        // 3天后：2026-09-09 00:00:00 (即 9-6、9-7、9-8 三天有效，9-9 0点截止)
        Instant expected = LocalDate.of(2026, 9, 9).atStartOfDay(ZONE).toInstant();
        assertEquals(expected, cutoff);

        Instant day2 = LocalDateTime.of(2026, 9, 7, 15, 0, 0).atZone(ZONE).toInstant();
        assertTrue(policy.isValid(regAt, day2, 1L, 10L, 100L));
    }
}
