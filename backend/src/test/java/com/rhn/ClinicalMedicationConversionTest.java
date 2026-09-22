package com.rhn;

import com.rhn.platform.masterdata.api.*;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import java.math.BigDecimal;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;

class ClinicalMedicationConversionTest {
    private MedicationStandardReference reference(String kind, String value, String unit, String volume, String volumeUnit) {
        var strength = JsonMapper.builder().build().readTree("""
                {"kind":"%s","computable":true,"numerator":{"value":"%s","unit":"%s"},
                 "denominator":{"value":"%s","unit":"%s"}}
                """.formatted(kind, value, unit, volume, volumeUnit));
        return new MedicationStandardReference("LINKED", "catalog", "1", "hash", "entry", "spec", 1,
                "测试浓度", "INJECTION", "2mL:0.1g", null, strength, "UNVERIFIED", List.of());
    }
    private ClinicalMedicationStandards.StandardFrequency frequency(String type) {
        return ClinicalMedicationStandards.frequency(new OrderFrequencyDirectory.FrequencySnapshot(1L, 0, "LOCAL", "测试",
                null, null, type, 2, BigDecimal.ONE, "D", "STANDARD_TIME", List.of(), "REMAINING_SLOTS", true));
    }
    @Test void concentration_converts_actual_volume_and_freezes_average_daily_mass() {
        var ref = reference("CONCENTRATION", "100", "mg", "2", "mL");
        var dose = ClinicalMedicationStandards.dose(new BigDecimal("0.005"), "L", ref, frequency("TIMES_PER_PERIOD"));
        assertThat(dose.singleDose()).isEqualByComparingTo("0.25");
        assertThat(dose.averageDailyDose()).isEqualByComparingTo("0.5");
        assertThat(dose.unit()).isEqualTo("g");
        assertThat(dose.conversionBasis()).isEqualTo("REFERENCE_MASS_PER_VOLUME");
        assertThat(ClinicalMedicationStandards.conversionCapability(ref).status()).isEqualTo("COMPUTABLE");
        // A denominator describes concentration; it does not identify the current product's container.
        assertThat(ClinicalMedicationStandards.dose(BigDecimal.ONE, "支", ref, null).status()).isEqualTo("UNAVAILABLE");
        assertThat(ClinicalMedicationStandards.dose(BigDecimal.ONE, "mL", ref, frequency("PRN")).averageDailyDose()).isNull();
    }
    @Test void mass_input_is_not_multiplied_by_concentration_twice() {
        var dose = ClinicalMedicationStandards.dose(new BigDecimal("250"), "mg",
                reference("CONCENTRATION", "100", "mg", "2", "mL"), null);
        assertThat(dose.singleDose()).isEqualByComparingTo("0.25");
        assertThat(dose.conversionBasis()).isEqualTo("CLINICAL_UNIT");
    }
    @Test void malformed_strength_and_incompatible_dimensions_cannot_be_used() {
        for (String value : List.of("0", "-1", "unknown", "")) {
            assertThat(ClinicalMedicationStandards.dose(BigDecimal.ONE, "mL",
                    reference("CONCENTRATION", "100", "mg", value, "mL"), null).status()).isEqualTo("UNAVAILABLE");
        }
        for (var ref : List.of(reference("CONCENTRATION", "100", "IU", "2", "mL"),
                reference("CONCENTRATION", "100", "mg", "2", "g"))) {
            assertThat(ClinicalMedicationStandards.conversionCapability(ref).status()).isEqualTo("UNAVAILABLE");
        }
    }
    @Test void absent_reference_or_percent_without_basis_never_becomes_a_mass_conversion() {
        for (var ref : List.of(MedicationStandardReference.unavailable("STALE", "VERSION_UNAVAILABLE"),
                reference("PERCENT_UNSPECIFIED_BASIS", "5", "%", "1", "mL"),
                reference("MULTI_COMPONENT", "100", "mg", "2", "mL"))) {
            var dose = ClinicalMedicationStandards.dose(BigDecimal.ONE, "mL", ref, null);
            assertThat(dose.unit()).isEqualTo("mL");
            assertThat(dose.conversionBasis()).isEqualTo("CLINICAL_UNIT");
            assertThat(ClinicalMedicationStandards.conversionCapability(ref).status()).isNotEqualTo("COMPUTABLE");
        }
    }
}
