package com.rhn.platform.masterdata.api;

import java.math.BigDecimal;
import java.util.List;

/** Deterministic frequency interpretation from structured fields, without reading the display or code. */
public final class ClinicalFrequencySemantics {
    private ClinicalFrequencySemantics() {}

    // A rational rate avoids rounding (e.g. one dose every seven days).
    public record Frequency(String kind, boolean dailyRateComputable, BigDecimal doses,
                            BigDecimal perDays, List<String> scheduledTimes, String unknownReason) {}

    public static Frequency interpret(OrderFrequencyDirectory.FrequencySnapshot snapshot) {
        if (snapshot == null) return unknown("OTHER", "FREQUENCY_MISSING", List.of());
        List<String> times = snapshot.executionTimes() == null ? List.of() : List.copyOf(snapshot.executionTimes());
        String rule = snapshot.ruleType() == null ? "OTHER" : snapshot.ruleType();
        return switch (rule) {
            case "PRN" -> unknown("AS_NEEDED", "AS_NEEDED_HAS_NO_FIXED_DAILY_RATE", times);
            case "ONCE" -> unknown("ONCE", "SINGLE_OCCURRENCE_HAS_NO_DAILY_RATE", times);
            case "CALENDAR" -> unknown("SCHEDULED_TIME", "CALENDAR_REQUIRES_DATE_CONTEXT", times);
            case "TIMES_PER_PERIOD", "FIXED_INTERVAL" -> rate(snapshot, times);
            default -> unknown("OTHER", "FREQUENCY_NOT_COMPUTABLE", times);
        };
    }

    private static Frequency rate(OrderFrequencyDirectory.FrequencySnapshot value, List<String> times) {
        String kind = "FIXED_INTERVAL".equals(value.ruleType()) ? "INTERVAL" : "TIMES_PER_DAY";
        if (value.periodValue() == null || value.periodValue().signum() <= 0) {
            return unknown(kind, "PERIOD_MISSING_OR_INVALID", times);
        }
        if ("INTERVAL".equals(kind) && !Integer.valueOf(1).equals(value.frequencyCount()))
            return unknown(kind, "INTERVAL_COUNT_CONFLICT", times);
        int count = "INTERVAL".equals(kind) ? 1 : value.frequencyCount() == null ? 0 : value.frequencyCount();
        if (count <= 0) return unknown(kind, "FREQUENCY_COUNT_MISSING_OR_INVALID", times);
        BigDecimal perDays = value.periodValue();
        BigDecimal doses = BigDecimal.valueOf(count);
        switch (value.periodUnit() == null ? "" : value.periodUnit()) {
            case "MIN" -> doses = doses.multiply(BigDecimal.valueOf(1440));
            case "H" -> doses = doses.multiply(BigDecimal.valueOf(24));
            case "D" -> { }
            case "WK" -> perDays = perDays.multiply(BigDecimal.valueOf(7));
            default -> { return unknown(kind, "PERIOD_UNIT_NOT_FIXED_LENGTH", times); }
        }
        return new Frequency(kind, true, doses.stripTrailingZeros(), perDays.stripTrailingZeros(), times, null);
    }

    private static Frequency unknown(String kind, String reason, List<String> times) {
        return new Frequency(kind, false, null, null, times, reason);
    }
}
