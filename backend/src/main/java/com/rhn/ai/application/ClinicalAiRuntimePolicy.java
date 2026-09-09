package com.rhn.ai.application;

import com.rhn.platform.configuration.api.ConfigurationDirectory;
import com.rhn.platform.configuration.api.ConfigurationValue;
import com.rhn.platform.cryptography.api.SecretEncryptionService;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.context.ExecutionContext;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;

import java.time.Duration;
import java.util.stream.Collectors;

@Service
public class ClinicalAiRuntimePolicy {
    public static final String PREFIX = "ai.clinical.";

    private final ConfigurationDirectory configurationDirectory;
    private final SecretEncryptionService secretEncryption;
    private final ClinicalAssistantSettings fallback;

    public ClinicalAiRuntimePolicy(ConfigurationDirectory configurationDirectory,
                                   SecretEncryptionService secretEncryption,
                                   ClinicalAssistantSettings fallback) {
        this.configurationDirectory = configurationDirectory;
        this.secretEncryption = secretEncryption;
        this.fallback = fallback;
    }

    public ClinicalAssistantSettings current(ExecutionContext context) {
        Long tenantId = context.tenantId();
        String apiKey = secret(tenantId, "api-key", fallback.apiKey());
        String knowledgeApiKey = secret(tenantId, "knowledge-api-key", null);
        if (knowledgeApiKey == null) knowledgeApiKey = apiKey != null ? apiKey : fallback.knowledgeApiKey();
        String speechEndpoint = booleanValue(tenantId, "voice-enabled", fallback.speechAvailable())
                ? text(tenantId, "speech-endpoint", uri(fallback.speechEndpoint())) : null;
        String knowledgeEndpoint = booleanValue(tenantId, "knowledge-enabled", fallback.knowledgeAvailable())
                ? text(tenantId, "knowledge-endpoint", uri(fallback.knowledgeEndpoint())) : null;
        return new ClinicalAssistantSettings(
                text(tenantId, "mode", fallback.mode().name()), fallback.provider(),
                text(tenantId, "model", fallback.model()),
                Duration.ofMinutes(number(tenantId, "suggestion-ttl-minutes", fallback.suggestionTtl().toMinutes())),
                text(tenantId, "endpoint", uri(fallback.endpoint())), apiKey,
                Duration.ofSeconds(number(tenantId, "request-timeout-seconds", fallback.requestTimeout().toSeconds())),
                (int) number(tenantId, "max-output-tokens", fallback.maxOutputTokens()),
                speechEndpoint,
                text(tenantId, "speech-model", fallback.speechModel()),
                (int) number(tenantId, "voice-max-audio-mb", fallback.maxAudioBytes() / (1024L * 1024L)) * 1024 * 1024,
                knowledgeEndpoint, knowledgeApiKey,
                (int) number(tenantId, "knowledge-max-results", fallback.maxKnowledgeResults()),
                fallback.enabledOrganizationIds().stream().map(String::valueOf).collect(Collectors.joining(",")),
                fallback.enabledDepartmentIds().stream().map(String::valueOf).collect(Collectors.joining(",")),
                (int) number(tenantId, "rollout-percentage", fallback.rolloutPercentage()));
    }

    public boolean booleanValue(Long tenantId, String suffix, boolean fallbackValue) {
        ConfigurationValue value = resolve(tenantId, suffix);
        JsonNode node = value == null ? null : value.value();
        return node == null || node.isNull() ? fallbackValue : node.asBoolean(fallbackValue);
    }

    public ConfigurationValue resolved(Long tenantId, String suffix) {
        return resolve(tenantId, suffix);
    }

    public String decrypt(ConfigurationValue value) {
        if (value == null || value.secretReference() == null) return null;
        return secretEncryption.decrypt(value.secretReference(), binding(value.resolvedScopeCode(), value.key()));
    }

    public static String binding(String scopeCode, String key) {
        return "scope:" + scopeCode + ":parameter:" + key;
    }

    private String secret(Long tenantId, String suffix, String fallbackValue) {
        ConfigurationValue value = resolve(tenantId, suffix);
        return value == null || value.secretReference() == null ? fallbackValue : decrypt(value);
    }

    private String text(Long tenantId, String suffix, String fallbackValue) {
        ConfigurationValue value = resolve(tenantId, suffix);
        JsonNode node = value == null ? null : value.value();
        return node == null || node.isNull() || node.asText().isBlank() ? fallbackValue : node.asText().trim();
    }

    private long number(Long tenantId, String suffix, long fallbackValue) {
        ConfigurationValue value = resolve(tenantId, suffix);
        JsonNode node = value == null ? null : value.value();
        return node == null || node.isNull() || !node.canConvertToLong() ? fallbackValue : node.asLong();
    }

    private ConfigurationValue resolve(Long tenantId, String suffix) {
        try {
            return configurationDirectory.resolveCurrent(tenantId, null, null, null, PREFIX + suffix);
        } catch (BusinessException exception) {
            if ("PARAMETER_NOT_FOUND".equals(exception.code()) || "PARAMETER_VALUE_NOT_FOUND".equals(exception.code())) return null;
            throw exception;
        }
    }

    private static String uri(java.net.URI value) {
        return value == null ? null : value.toString();
    }
}
