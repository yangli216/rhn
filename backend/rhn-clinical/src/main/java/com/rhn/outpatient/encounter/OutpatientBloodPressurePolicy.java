package com.rhn.outpatient.encounter;

import com.rhn.platform.configuration.api.ConfigurationDirectory;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;

import java.time.LocalDate;
import java.time.Period;
import java.util.Locale;

/**
 * 门诊血压测量要求：按机构/科室参数决定本次就诊是否必须填写收缩压和舒张压，以及在哪一步阻断。
 * 每次就诊都按首诊处理，只看就诊日周岁年龄；参数缺失或字段不完整时按产品默认值（18 周岁、年龄不明必测、诊毕阻断）。
 */
@Service
public class OutpatientBloodPressurePolicy {
    public static final String PARAMETER_KEY = "outpatient.vital-signs.blood-pressure.requirement";
    static final Settings DEFAULT_SETTINGS = new Settings(true, 18, true, EnforceAt.COMPLETION);

    private final ConfigurationDirectory configuration;

    public OutpatientBloodPressurePolicy(ConfigurationDirectory configuration) {
        this.configuration = configuration;
    }

    Requirement evaluate(Encounter encounter, LocalDate birthDate, LocalDate visitDate) {
        return requirement(resolve(encounter), birthDate, visitDate);
    }

    static Requirement requirement(Settings settings, LocalDate birthDate, LocalDate visitDate) {
        if (!settings.enabled()) return new Requirement(false, settings.enforceAt(), settings.minAge(), null);
        boolean ageUnknown = birthDate == null || birthDate.isAfter(visitDate);
        if (ageUnknown) {
            return new Requirement(settings.unknownAgeRequired(), settings.enforceAt(), settings.minAge(),
                    settings.unknownAgeRequired() ? "患者年龄未确认，请填写收缩压和舒张压" : null);
        }
        boolean required = Period.between(birthDate, visitDate).getYears() >= settings.minAge();
        return new Requirement(required, settings.enforceAt(), settings.minAge(),
                required ? "按本机构要求，" + settings.minAge() + " 周岁及以上患者就诊须填写收缩压和舒张压" : null);
    }

    Settings resolve(Encounter encounter) {
        var configured = configuration.resolveCurrent(encounter.tenantId(), null, encounter.organizationId(),
                encounter.departmentId(), PARAMETER_KEY);
        return configured == null ? DEFAULT_SETTINGS : parse(configured.value());
    }

    static Settings parse(JsonNode value) {
        if (value == null || !value.isObject()) return DEFAULT_SETTINGS;
        boolean enabled = value.path("enabled").isBoolean() ? value.get("enabled").asBoolean() : DEFAULT_SETTINGS.enabled();
        int minAge = value.path("minAge").isIntegralNumber() && value.get("minAge").asInt() >= 0
                ? value.get("minAge").asInt() : DEFAULT_SETTINGS.minAge();
        boolean unknownAgeRequired = value.path("unknownAgeRequired").isBoolean()
                ? value.get("unknownAgeRequired").asBoolean() : DEFAULT_SETTINGS.unknownAgeRequired();
        EnforceAt enforceAt = DEFAULT_SETTINGS.enforceAt();
        if (value.path("enforceAt").isString()) {
            try {
                enforceAt = EnforceAt.valueOf(value.get("enforceAt").asString().trim().toUpperCase(Locale.ROOT));
            } catch (IllegalArgumentException ignored) {
                // 非法取值已由参数平台拒绝写入；历史脏数据按默认值处理。
            }
        }
        return new Settings(enabled, minAge, unknownAgeRequired, enforceAt);
    }

    public enum EnforceAt { DRAFT, COMPLETION }

    record Settings(boolean enabled, int minAge, boolean unknownAgeRequired, EnforceAt enforceAt) {}

    /** required 为 true 时 message 给出阻断提示。 */
    public record Requirement(boolean required, EnforceAt enforceAt, int minAge, String message) {
        boolean blocksDraft() { return required && enforceAt == EnforceAt.DRAFT; }
        boolean blocksCompletion() { return required; }
    }
}
