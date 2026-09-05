package com.rhn.healthcore.api;

import java.math.BigDecimal;
import java.util.List;

public interface ClinicalValidationDirectory {
    VitalValidationProfile vitalSignsProfile();

    void validateVitalSigns(VitalSignsInput input);

    record VitalSignsInput(
            BigDecimal temperatureCelsius,
            BigDecimal pulseRate,
            BigDecimal respiratoryRate,
            BigDecimal systolicBloodPressure,
            BigDecimal diastolicBloodPressure,
            BigDecimal oxygenSaturation,
            BigDecimal heightCm,
            BigDecimal weightKg,
            BigDecimal intakeVolumeMl,
            BigDecimal outputVolumeMl) {
    }

    record VitalSignRule(
            String code,
            String name,
            String unit,
            BigDecimal hardMinimum,
            BigDecimal hardMaximum,
            BigDecimal warningMinimum,
            BigDecimal warningMaximum) {
    }

    record VitalValidationProfile(List<VitalSignRule> rules) {
        public VitalValidationProfile {
            rules = List.copyOf(rules);
        }
    }
}
