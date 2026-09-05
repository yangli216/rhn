package com.rhn.healthcore.validation;

import com.rhn.healthcore.api.ClinicalValidationDirectory;
import com.rhn.platform.configuration.api.ConfigurationDirectory;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static com.rhn.shared.api.BusinessErrors.badRequest;

@Service
public class ClinicalValidationService implements ClinicalValidationDirectory {
    private static final String KEY_PREFIX = "clinical-safety.vital-signs.";
    private static final Map<String, RuleDefinition> DEFINITIONS = definitions();

    private final ConfigurationDirectory configuration;
    private final ExecutionContextProvider contextProvider;

    public ClinicalValidationService(ConfigurationDirectory configuration,
                                     ExecutionContextProvider contextProvider) {
        this.configuration = configuration;
        this.contextProvider = contextProvider;
    }

    @Override
    public VitalValidationProfile vitalSignsProfile() {
        ExecutionContext context = contextProvider.requireCurrent();
        List<VitalSignRule> rules = DEFINITIONS.entrySet().stream()
                .map(entry -> rule(context, entry.getKey(), entry.getValue()))
                .toList();
        return new VitalValidationProfile(rules);
    }

    @Override
    public void validateVitalSigns(VitalSignsInput input) {
        if (input == null) return;
        requireRange(input.temperatureCelsius(), definition("temperature"));
        requireRange(input.pulseRate(), definition("pulse"));
        requireRange(input.respiratoryRate(), definition("respiratory-rate"));
        requireRange(input.systolicBloodPressure(), definition("systolic-pressure"));
        requireRange(input.diastolicBloodPressure(), definition("diastolic-pressure"));
        requireRange(input.oxygenSaturation(), definition("oxygen-saturation"));
        requireRange(input.heightCm(), definition("height"));
        requireRange(input.weightKg(), definition("weight"));
        requireRange(input.intakeVolumeMl(), definition("intake-volume"));
        requireRange(input.outputVolumeMl(), definition("output-volume"));

        boolean systolicPresent = input.systolicBloodPressure() != null;
        boolean diastolicPresent = input.diastolicBloodPressure() != null;
        if (systolicPresent != diastolicPresent) {
            throw badRequest("CLINICAL_BLOOD_PRESSURE_PAIR_REQUIRED", "收缩压和舒张压必须同时录入");
        }
        if (systolicPresent && input.systolicBloodPressure().compareTo(input.diastolicBloodPressure()) <= 0) {
            throw badRequest("CLINICAL_BLOOD_PRESSURE_RELATION_INVALID", "收缩压必须大于舒张压");
        }
    }

    private VitalSignRule rule(ExecutionContext context, String code, RuleDefinition definition) {
        BigDecimal warningMinimum = definition.warningMinimumKey() == null ? null
                : resolveNumber(context, definition.warningMinimumKey());
        BigDecimal warningMaximum = definition.warningMaximumKey() == null ? null
                : resolveNumber(context, definition.warningMaximumKey());
        if (warningMinimum != null && warningMinimum.compareTo(definition.hardMinimum()) < 0
                || warningMaximum != null && warningMaximum.compareTo(definition.hardMaximum()) > 0
                || warningMinimum != null && warningMaximum != null
                && warningMinimum.compareTo(warningMaximum) >= 0) {
            throw badRequest("CLINICAL_SAFETY_CONFIGURATION_INVALID", definition.name() + "警戒阈值配置不合法");
        }
        return new VitalSignRule(code, definition.name(), definition.unit(), definition.hardMinimum(),
                definition.hardMaximum(), warningMinimum, warningMaximum);
    }

    private BigDecimal resolveNumber(ExecutionContext context, String suffix) {
        var resolved = configuration.resolveCurrent(context.tenantId(), context.subjectId(),
                context.organizationId(), context.departmentId(), KEY_PREFIX + suffix);
        if (resolved.value() == null || !resolved.value().isNumber()) {
            throw badRequest("CLINICAL_SAFETY_CONFIGURATION_INVALID", "生命体征警戒参数必须为数值");
        }
        return resolved.value().decimalValue();
    }

    private static void requireRange(BigDecimal value, RuleDefinition definition) {
        if (value == null) return;
        if (value.compareTo(definition.hardMinimum()) < 0 || value.compareTo(definition.hardMaximum()) > 0) {
            throw badRequest("CLINICAL_VITAL_VALUE_INVALID", definition.name() + "必须在"
                    + plain(definition.hardMinimum()) + "至" + plain(definition.hardMaximum())
                    + definition.unit() + "之间");
        }
    }

    private static RuleDefinition definition(String code) {
        return DEFINITIONS.get(code);
    }

    private static String plain(BigDecimal value) {
        return value.stripTrailingZeros().toPlainString();
    }

    private static Map<String, RuleDefinition> definitions() {
        Map<String, RuleDefinition> values = new LinkedHashMap<>();
        values.put("temperature", new RuleDefinition("体温", "℃", decimal("20"), decimal("45"),
                "temperature.warning-min", "temperature.warning-max"));
        values.put("pulse", new RuleDefinition("脉搏", "次/分", decimal("0"), decimal("300"),
                "pulse.warning-min", "pulse.warning-max"));
        values.put("respiratory-rate", new RuleDefinition("呼吸频率", "次/分", decimal("0"), decimal("100"),
                "respiratory-rate.warning-min", "respiratory-rate.warning-max"));
        values.put("systolic-pressure", new RuleDefinition("收缩压", "mmHg", decimal("20"), decimal("300"),
                "systolic-pressure.warning-min", "systolic-pressure.warning-max"));
        values.put("diastolic-pressure", new RuleDefinition("舒张压", "mmHg", decimal("10"), decimal("200"),
                "diastolic-pressure.warning-min", "diastolic-pressure.warning-max"));
        values.put("oxygen-saturation", new RuleDefinition("血氧饱和度", "%", decimal("0"), decimal("100"),
                "oxygen-saturation.warning-min", null));
        values.put("height", new RuleDefinition("身高", "cm", decimal("20"), decimal("250"), null, null));
        values.put("weight", new RuleDefinition("体重", "kg", decimal("0.1"), decimal("500"), null, null));
        values.put("intake-volume", new RuleDefinition("入量", "mL", decimal("0"), decimal("100000"), null, null));
        values.put("output-volume", new RuleDefinition("出量", "mL", decimal("0"), decimal("100000"), null, null));
        return Collections.unmodifiableMap(values);
    }

    private static BigDecimal decimal(String value) {
        return new BigDecimal(value);
    }

    private record RuleDefinition(String name, String unit, BigDecimal hardMinimum, BigDecimal hardMaximum,
                                  String warningMinimumKey, String warningMaximumKey) {
    }
}
