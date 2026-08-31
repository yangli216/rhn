package com.rhn.ai.application;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.List;
import java.util.Locale;

@Component
final class ClinicalAssistantSettings {
    private final Mode mode;
    private final String provider;
    private final String model;
    private final Duration suggestionTtl;

    ClinicalAssistantSettings(@Value("${rhn.ai.mode:DISABLED}") String mode,
                              @Value("${rhn.ai.provider:disabled}") String provider,
                              @Value("${rhn.ai.model:}") String model,
                              @Value("${rhn.ai.suggestion-ttl:PT30M}") Duration suggestionTtl) {
        this.mode = Mode.parse(mode);
        this.provider = clean(provider, this.mode == Mode.LOCAL_ASSIST ? "local-assist" : "disabled");
        this.model = clean(model, null);
        this.suggestionTtl = suggestionTtl == null || suggestionTtl.isNegative() || suggestionTtl.isZero()
                ? Duration.ofMinutes(30) : suggestionTtl;
    }

    Mode mode() { return mode; }
    String provider() { return provider; }
    String model() { return model; }
    Duration suggestionTtl() { return suggestionTtl; }
    boolean available() { return mode == Mode.LOCAL_ASSIST; }

    List<String> features() {
        return available() ? List.of("RECORD_COMPLETENESS", "SAFETY_REMINDERS", "TERMINOLOGY_VALIDATION",
                "PLAN_RECOMMENDATIONS", "AUDIT_TRAIL") : List.of();
    }

    String message() {
        return switch (mode) {
            case LOCAL_ASSIST -> "本地辅助已启用：仅做缺项、风险、术语和既有方案核对，不生成自由药品剂量。";
            case MODEL -> "外部模型适配器尚未配置，AI 建议暂不可用；医生站原有功能不受影响。";
            case DISABLED -> "智医助理未启用；医生站原有功能不受影响。";
        };
    }

    private static String clean(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    enum Mode {
        DISABLED, LOCAL_ASSIST, MODEL;

        static Mode parse(String value) {
            if (value == null) return DISABLED;
            try {
                return valueOf(value.trim().toUpperCase(Locale.ROOT).replace('-', '_'));
            } catch (IllegalArgumentException exception) {
                return DISABLED;
            }
        }
    }
}
