package com.rhn.platform.masterdata.api;

import java.math.BigDecimal;
import java.math.MathContext;
import java.util.List;

/** Structural identities and arithmetic only. No recommended dose or clinical limit is inferred. */
public final class ClinicalMedicationStandards {
    private ClinicalMedicationStandards() {}
    public static final String VERSION = "rhn-medication-standards-v1";
    private static final java.util.Map<String, String> COMMON_FREQUENCIES = java.util.Map.ofEntries(
            java.util.Map.entry("QD", "TIMES_PER_DAY:1/1:DAY"), java.util.Map.entry("BID", "TIMES_PER_DAY:2/1:DAY"),
            java.util.Map.entry("TID", "TIMES_PER_DAY:3/1:DAY"), java.util.Map.entry("QID", "TIMES_PER_DAY:4/1:DAY"),
            java.util.Map.entry("Q4H", "INTERVAL:6/1:DAY"), java.util.Map.entry("Q6H", "INTERVAL:4/1:DAY"),
            java.util.Map.entry("Q8H", "INTERVAL:3/1:DAY"), java.util.Map.entry("Q12H", "INTERVAL:2/1:DAY"),
            java.util.Map.entry("Q24H", "INTERVAL:1/1:DAY"), java.util.Map.entry("PRN", "AS_NEEDED"),
            java.util.Map.entry("ONCE", "ONCE"), java.util.Map.entry("ST", "ONCE"));

    public static boolean commonCodeConsistent(OrderFrequencyDirectory.FrequencySnapshot value) {
        String expected = value.code() == null ? null : COMMON_FREQUENCIES.get(value.code().trim().toUpperCase(java.util.Locale.ROOT));
        return expected == null || expected.equals(frequency(value).conceptId());
    }

    public record StandardFrequency(String system, String version, String conceptId, String status,
            ClinicalFrequencySemantics.Frequency interpretation) {}
    public record Dose(String version, String status, BigDecimal singleDose, String unit,
            BigDecimal averageDailyDose, String conversionBasis, List<String> unavailableReasons) {}

    public static StandardFrequency frequency(OrderFrequencyDirectory.FrequencySnapshot value) {
        var semantics = ClinicalFrequencySemantics.interpret(value);
        String key = semantics.kind();
        boolean recognized = !"OTHER".equals(key);
        if (semantics.dailyRateComputable()) {
            // Keep interval schedules distinct from repeated daily schedules with the same average rate.
            BigDecimal[] ratio = canonicalRatio(semantics.doses(), semantics.perDays());
            key += ":" + ratio[0].toPlainString() + "/" + ratio[1].toPlainString() + ":DAY";
        } else if (!List.of("AS_NEEDED", "ONCE").contains(key)) {
            recognized = false; // Calendar schedules need a dated schedule; CONTINUOUS needs rate data.
        }
        return new StandardFrequency("RHN.CLINICAL.FREQUENCY", VERSION, recognized ? key : null,
                recognized ? "STANDARDIZED" : "UNAVAILABLE", semantics);
    }

    private static BigDecimal[] canonicalRatio(BigDecimal a, BigDecimal b) {
        int scale = Math.max(0, Math.max(a.scale(), b.scale()));
        var numerator = a.movePointRight(scale).toBigIntegerExact();
        var denominator = b.movePointRight(scale).toBigIntegerExact();
        var gcd = numerator.gcd(denominator);
        return new BigDecimal[]{new BigDecimal(numerator.divide(gcd)), new BigDecimal(denominator.divide(gcd))};
    }

    public static Dose dose(BigDecimal amount, String unit, MedicationStandardReference reference, StandardFrequency frequency) {
        if (amount == null || amount.signum() <= 0) return unavailable("DOSE_MISSING_OR_INVALID");
        var clinical = ClinicalDoseUnits.resolve(unit);
        BigDecimal normalized; String canonical; String basis;
        if (clinical.isPresent()) {
            canonical = clinical.get().canonicalUnit();
            normalized = ClinicalDoseUnits.convert(amount, unit, canonical).orElseThrow();
            basis = "CLINICAL_UNIT";
        } else {
            if (reference == null || !reference.linked()) return unavailable("STANDARD_REFERENCE_MISSING");
            var strength = reference.strength();
            if (unit == null || !unit.equals(reference.presentationUnit()) || strength == null
                    || !"AMOUNT_PER_PRESENTATION".equals(strength.path("kind").asString())
                    || !strength.path("computable").asBoolean()) return unavailable("DOSE_CONVERSION_NOT_DEFINED");
            var numerator = strength.path("numerator");
            var strengthUnit = ClinicalDoseUnits.resolve(numerator.path("unit").asString());
            if (strengthUnit.isEmpty()) return unavailable("STRENGTH_UNIT_NOT_COMPUTABLE");
            canonical = strengthUnit.get().canonicalUnit();
            normalized = ClinicalDoseUnits.convert(amount.multiply(new BigDecimal(numerator.path("value").asString())),
                    numerator.path("unit").asString(), canonical).orElseThrow();
            basis = "REFERENCE_AMOUNT_PER_PRESENTATION";
        }
        var rate = frequency == null ? null : frequency.interpretation();
        BigDecimal daily = rate != null && rate.dailyRateComputable()
                ? normalized.multiply(rate.doses()).divide(rate.perDays(), MathContext.DECIMAL128).stripTrailingZeros() : null;
        return new Dose(VERSION, "COMPUTABLE", normalized.stripTrailingZeros(), canonical, daily, basis,
                daily == null ? List.of(rate == null ? "FREQUENCY_MISSING" : rate.unknownReason()) : List.of());
    }
    private static Dose unavailable(String reason) {
        return new Dose(VERSION, "UNAVAILABLE", null, null, null, null, List.of(reason));
    }
}
