package com.rhn.ai.application;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.time.Duration;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

@Component
public final class ClinicalAssistantSettings {
    private final Mode mode;
    private final String provider;
    private final String model;
    private final Duration suggestionTtl;
    private final URI endpoint;
    private final String apiKey;
    private final Duration requestTimeout;
    private final int maxOutputTokens;
    private final URI speechEndpoint;
    private final String speechModel;
    private final int maxAudioBytes;
    private final URI knowledgeEndpoint;
    private final String knowledgeApiKey;
    private final int maxKnowledgeResults;
    private final Set<Long> enabledOrganizationIds;
    private final Set<Long> enabledDepartmentIds;
    private final int rolloutPercentage;

    @Autowired
    public ClinicalAssistantSettings(@Value("${rhn.ai.mode:DISABLED}") String mode,
                                     @Value("${rhn.ai.provider:disabled}") String provider,
                                     @Value("${rhn.ai.model:}") String model,
                                     @Value("${rhn.ai.suggestion-ttl:PT30M}") Duration suggestionTtl,
                                     @Value("${rhn.ai.endpoint:}") String endpoint,
                                     @Value("${rhn.ai.api-key:}") String apiKey,
                                     @Value("${rhn.ai.request-timeout:PT45S}") Duration requestTimeout,
                                     @Value("${rhn.ai.max-output-tokens:3000}") int maxOutputTokens,
                                     @Value("${rhn.ai.speech-endpoint:}") String speechEndpoint,
                                     @Value("${rhn.ai.speech-model:gpt-transcribe}") String speechModel,
                                     @Value("${rhn.ai.max-audio-bytes:20971520}") int maxAudioBytes,
                                     @Value("${rhn.ai.knowledge-endpoint:}") String knowledgeEndpoint,
                                     @Value("${rhn.ai.knowledge-api-key:}") String knowledgeApiKey,
                                     @Value("${rhn.ai.max-knowledge-results:5}") int maxKnowledgeResults,
                                     @Value("${rhn.ai.rollout.organization-ids:}") String enabledOrganizationIds,
                                     @Value("${rhn.ai.rollout.department-ids:}") String enabledDepartmentIds,
                                     @Value("${rhn.ai.rollout.percentage:100}") int rolloutPercentage) {
        this.mode = Mode.parse(mode);
        this.provider = clean(provider, switch (this.mode) {
            case LOCAL_ASSIST -> "local-assist";
            case MODEL -> "openai-compatible";
            case DISABLED -> "disabled";
        });
        this.model = clean(model, null);
        this.suggestionTtl = suggestionTtl == null || suggestionTtl.isNegative() || suggestionTtl.isZero()
                ? Duration.ofMinutes(30) : suggestionTtl;
        this.endpoint = endpointUri(endpoint);
        this.apiKey = clean(apiKey, null);
        this.requestTimeout = requestTimeout == null || requestTimeout.isNegative() || requestTimeout.isZero()
                ? Duration.ofSeconds(45) : requestTimeout;
        this.maxOutputTokens = Math.max(512, Math.min(maxOutputTokens, 8000));
        this.speechEndpoint = endpointUri(speechEndpoint);
        this.speechModel = clean(speechModel, "gpt-transcribe");
        this.maxAudioBytes = Math.max(1024, Math.min(maxAudioBytes, 20 * 1024 * 1024));
        this.knowledgeEndpoint = endpointUri(knowledgeEndpoint);
        this.knowledgeApiKey = clean(knowledgeApiKey, this.apiKey);
        this.maxKnowledgeResults = Math.max(1, Math.min(maxKnowledgeResults, 10));
        this.enabledOrganizationIds = ids(enabledOrganizationIds);
        this.enabledDepartmentIds = ids(enabledDepartmentIds);
        this.rolloutPercentage = Math.max(0, Math.min(rolloutPercentage, 100));
    }

    public ClinicalAssistantSettings(String mode, String provider, String model, Duration suggestionTtl,
                                     String endpoint, String apiKey, Duration requestTimeout, int maxOutputTokens,
                                     String speechEndpoint, String speechModel, int maxAudioBytes,
                                     String knowledgeEndpoint, String knowledgeApiKey, int maxKnowledgeResults) {
        this(mode, provider, model, suggestionTtl, endpoint, apiKey, requestTimeout, maxOutputTokens,
                speechEndpoint, speechModel, maxAudioBytes, knowledgeEndpoint, knowledgeApiKey,
                maxKnowledgeResults, "", "", 100);
    }

    public Mode mode() { return mode; }
    public String provider() { return provider; }
    public String model() { return model; }
    public Duration suggestionTtl() { return suggestionTtl; }
    public URI endpoint() { return endpoint; }
    public String apiKey() { return apiKey; }
    public Duration requestTimeout() { return requestTimeout; }
    public int maxOutputTokens() { return maxOutputTokens; }
    public URI speechEndpoint() { return speechEndpoint; }
    public String speechModel() { return speechModel; }
    public int maxAudioBytes() { return maxAudioBytes; }
    public URI knowledgeEndpoint() { return knowledgeEndpoint; }
    public String knowledgeApiKey() { return knowledgeApiKey; }
    public int maxKnowledgeResults() { return maxKnowledgeResults; }
    public Set<Long> enabledOrganizationIds() { return enabledOrganizationIds; }
    public Set<Long> enabledDepartmentIds() { return enabledDepartmentIds; }
    public int rolloutPercentage() { return rolloutPercentage; }
    public boolean speechAvailable() { return mode == Mode.MODEL && speechEndpoint != null && speechModel != null; }
    public boolean knowledgeAvailable() { return mode == Mode.MODEL && knowledgeEndpoint != null; }
    public boolean available() { return mode == Mode.LOCAL_ASSIST || mode == Mode.MODEL && endpoint != null && model != null; }

    public boolean availableFor(com.rhn.shared.context.ExecutionContext context) {
        if (!available() || context == null || context.tenantId() == null) return false;
        if (!enabledOrganizationIds.isEmpty() && !enabledOrganizationIds.contains(context.organizationId())) return false;
        if (!enabledDepartmentIds.isEmpty() && !enabledDepartmentIds.contains(context.departmentId())) return false;
        if (rolloutPercentage >= 100) return true;
        if (rolloutPercentage <= 0) return false;
        long subject = context.practitionerId() != null ? context.practitionerId()
                : context.subjectId() != null ? context.subjectId() : context.tenantId();
        return Math.floorMod(Long.hashCode(subject), 100) < rolloutPercentage;
    }

    public List<String> features() {
        if (!available()) return List.of();
        if (mode == Mode.LOCAL_ASSIST) {
            return List.of("RECORD_COMPLETENESS", "SAFETY_REMINDERS", "TERMINOLOGY_VALIDATION",
                    "PLAN_RECOMMENDATIONS", "AUDIT_TRAIL");
        }
        List<String> features = new java.util.ArrayList<>(List.of(
                "RECORD_COMPLETENESS", "CLINICAL_RECORD_DRAFT", "STREAMING_DRAFT", "BACKGROUND_DRAFT", "SAFETY_REMINDERS",
                "TERMINOLOGY_VALIDATION", "DIFFERENTIAL_DIAGNOSIS", "PLAN_RECOMMENDATIONS",
                "REPORT_INTERPRETATION", "CLINICAL_FOLLOW_UP", "FACT_CHECK",
                "DIAGNOSIS_REASONING", "CONVERSATION_FOLLOW_UP", "LONGITUDINAL_HISTORY", "AUDIT_TRAIL",
                "PLAN_COMPILATION"));
        if (speechAvailable()) features.add("VOICE_TRANSCRIPTION");
        if (knowledgeAvailable()) features.add("KNOWLEDGE_RETRIEVAL");
        return List.copyOf(features);
    }

    public List<String> featuresFor(com.rhn.shared.context.ExecutionContext context) {
        return availableFor(context) ? features() : List.of();
    }

    public String message() {
        return switch (mode) {
            case LOCAL_ASSIST -> "本地辅助已启用：仅做缺项、风险、术语和既有方案核对，不生成自由药品剂量。";
            case MODEL -> available()
                    ? "模型辅助已启用：输出会经过院内术语、方案白名单和确定性安全规则复核。"
                    : "模型辅助配置不完整，请配置服务端模型地址和模型名称；医生站原有功能不受影响。";
            case DISABLED -> "智医助理未启用；医生站原有功能不受影响。";
        };
    }

    public String messageFor(com.rhn.shared.context.ExecutionContext context) {
        if (availableFor(context)) return message();
        if (available()) return "智医助理尚未在当前机构、科室或灰度范围启用；医生站原有功能不受影响。";
        return message();
    }

    private static URI endpointUri(String value) {
        if (value == null || value.isBlank()) return null;
        try {
            URI uri = URI.create(value.trim());
            return uri.isAbsolute() && ("http".equalsIgnoreCase(uri.getScheme())
                    || "https".equalsIgnoreCase(uri.getScheme())) ? uri : null;
        } catch (IllegalArgumentException exception) {
            return null;
        }
    }

    private static String clean(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    private static Set<Long> ids(String value) {
        if (value == null || value.isBlank()) return Set.of();
        try {
            return Arrays.stream(value.split(",")).map(String::trim).filter(item -> !item.isEmpty())
                    .map(Long::valueOf).filter(item -> item > 0).collect(Collectors.toUnmodifiableSet());
        } catch (NumberFormatException exception) {
            throw new IllegalArgumentException("AI rollout identifiers must be comma-separated positive integers", exception);
        }
    }

    public enum Mode {
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
