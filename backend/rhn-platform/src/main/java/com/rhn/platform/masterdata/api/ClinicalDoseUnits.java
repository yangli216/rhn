package com.rhn.platform.masterdata.api;

import java.math.BigDecimal;
import java.math.MathContext;
import java.util.Map;
import java.util.Optional;

/** Versioned clinical unit vocabulary. Package/presentation counts are deliberately not conversions. */
public final class ClinicalDoseUnits {
    private ClinicalDoseUnits() {}

    public record Unit(String id, String code, String display, String dimension,
                       String canonicalUnit, BigDecimal conversionFactor, int semanticVersion) {}

    private static Unit unit(String code, String display, String dimension, String canonical, String factor) {
        return new Unit("UCUM:" + code, code, display, dimension, canonical, new BigDecimal(factor), 1);
    }
    private static final Map<String, Unit> UNITS = Map.of(
            "kg", unit("kg", "千克", "MASS", "g", "1000"),
            "g", unit("g", "克", "MASS", "g", "1"),
            "mg", unit("mg", "毫克", "MASS", "g", "0.001"),
            "ug", unit("ug", "微克", "MASS", "g", "0.000001"),
            "ng", unit("ng", "纳克", "MASS", "g", "0.000000001"),
            "L", unit("L", "升", "VOLUME", "mL", "1000"),
            "mL", unit("mL", "毫升", "VOLUME", "mL", "1"),
            "uL", unit("uL", "微升", "VOLUME", "mL", "0.001"));
    private static final Map<String, String> ALIASES = Map.ofEntries(
            Map.entry("千克", "kg"), Map.entry("克", "g"), Map.entry("毫克", "mg"),
            Map.entry("微克", "ug"), Map.entry("μg", "ug"), Map.entry("µg", "ug"),
            Map.entry("纳克", "ng"), Map.entry("升", "L"), Map.entry("毫升", "mL"),
            Map.entry("ml", "mL"), Map.entry("微升", "uL"), Map.entry("μL", "uL"), Map.entry("µL", "uL"));

    public static Optional<Unit> resolve(String codeOrAlias) {
        if (codeOrAlias == null) return Optional.empty();
        String value = codeOrAlias.strip();
        return Optional.ofNullable(UNITS.get(ALIASES.getOrDefault(value, value)));
    }

    public static java.util.List<Unit> vocabulary() {
        return UNITS.values().stream().sorted(java.util.Comparator.comparing(Unit::code)).toList();
    }

    /** Empty means unknown/incompatible, never zero. No mass-volume or package conversion is inferred. */
    public static Optional<BigDecimal> convert(BigDecimal value, String from, String to) {
        if (value == null || value.signum() < 0) return Optional.empty();
        Optional<Unit> source = resolve(from), target = resolve(to);
        if (source.isEmpty() || target.isEmpty() || !source.get().dimension().equals(target.get().dimension())) {
            return Optional.empty();
        }
        return Optional.of(value.multiply(source.get().conversionFactor())
                .divide(target.get().conversionFactor(), MathContext.DECIMAL128).stripTrailingZeros());
    }
}
