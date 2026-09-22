package com.rhn;

import com.rhn.platform.masterdata.api.ClinicalDoseUnits;
import com.rhn.platform.masterdata.api.ClinicalFrequencySemantics;
import com.rhn.platform.masterdata.api.OrderFrequencyDirectory.FrequencySnapshot;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;

class ClinicalSemanticPrimitivesTest {
    @Test void converts_only_compatible_clinical_dimensions() {
        assertThat(ClinicalDoseUnits.convert(new BigDecimal("0.5"), "g", "mg").orElseThrow()).isEqualByComparingTo("500");
        assertThat(ClinicalDoseUnits.convert(new BigDecimal("500"), "μg", "mg").orElseThrow()).isEqualByComparingTo("0.5");
        assertThat(ClinicalDoseUnits.convert(new BigDecimal("0.5"), "L", "毫升").orElseThrow()).isEqualByComparingTo("500");
        assertThat(ClinicalDoseUnits.convert(BigDecimal.ONE, "mg", "mL")).isEmpty();
        for (String count : List.of("片", "粒", "支", "盒", "瓶", "BOX", "IU", "未知")) {
            assertThat(ClinicalDoseUnits.convert(BigDecimal.ONE, count, count)).isEmpty();
        }
    }
    @Test void aliases_share_a_stable_canonical_unit_identity() {
        assertThat(ClinicalDoseUnits.resolve("mg")).isEqualTo(ClinicalDoseUnits.resolve("毫克"));
        assertThat(ClinicalDoseUnits.resolve("mL").orElseThrow().semanticVersion()).isEqualTo(1);
        assertThat(ClinicalDoseUnits.resolve("MG")).isEmpty();
    }
    @Test void frequency_rate_uses_structured_fields_even_when_name_and_code_are_misleading() {
        var bid = ClinicalFrequencySemantics.interpret(frequency("TIMES_PER_PERIOD", 2, "1", "D"));
        assertThat(bid.doses()).isEqualByComparingTo("2");
        assertThat(bid.perDays()).isEqualByComparingTo("1");
        var everyEightHours = ClinicalFrequencySemantics.interpret(frequency("FIXED_INTERVAL", 1, "8", "H"));
        assertThat(everyEightHours.doses().divide(everyEightHours.perDays())).isEqualByComparingTo("3");
        var inconsistent = ClinicalFrequencySemantics.interpret(frequency("FIXED_INTERVAL", 99, "8", "H"));
        assertThat(inconsistent.dailyRateComputable()).isFalse();
        assertThat(inconsistent.unknownReason()).isEqualTo("INTERVAL_COUNT_CONFLICT");
        var weekly = ClinicalFrequencySemantics.interpret(frequency("TIMES_PER_PERIOD", 1, "1", "WK"));
        assertThat(weekly.doses()).isEqualByComparingTo("1");
        assertThat(weekly.perDays()).isEqualByComparingTo("7");
    }
    @Test void prn_once_calendar_and_missing_values_do_not_become_zero_daily_doses() {
        for (String kind : List.of("PRN", "ONCE", "CALENDAR", "CONTINUOUS")) {
            var result = ClinicalFrequencySemantics.interpret(frequency(kind, 1, "1", "D"));
            assertThat(result.dailyRateComputable()).isFalse();
            assertThat(result.doses()).isNull();
            assertThat(result.unknownReason()).isNotBlank();
        }
        assertThat(ClinicalFrequencySemantics.interpret(null).dailyRateComputable()).isFalse();
        assertThat(ClinicalFrequencySemantics.interpret(frequency("TIMES_PER_PERIOD", 1, "1", "MO")).dailyRateComputable()).isFalse();
    }
    private FrequencySnapshot frequency(String type, int count, String period, String unit) {
        return new FrequencySnapshot(1L, 0, "MISLEADING-QD", "每日九十九次", null, null, type, count,
                new BigDecimal(period), unit, "STANDARD_TIME", List.of("08:00"), "REMAINING_SLOTS", true);
    }
}
