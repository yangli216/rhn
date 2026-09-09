package com.rhn.ai.application;

import com.rhn.ai.api.ClinicalAiAdministrationContracts.ConfigurationView;
import com.rhn.ai.api.ClinicalAiAdministrationContracts.RuntimeStatus;
import com.rhn.ai.api.ClinicalAiAdministrationContracts.Scope;
import com.rhn.ai.api.ClinicalAiAdministrationContracts.SettingUpdate;
import com.rhn.ai.api.ClinicalAiAdministrationContracts.SettingView;
import com.rhn.ai.api.ClinicalAiAdministrationContracts.UpdateRequest;
import com.rhn.platform.configuration.api.ConfigurationAdministration;
import com.rhn.platform.configuration.api.ConfigurationAdministration.ManagedValue;
import com.rhn.platform.configuration.api.ConfigurationAdministration.ManagedValueCommand;
import com.rhn.platform.configuration.api.ConfigurationAdministration.ValueMode;
import com.rhn.platform.configuration.api.ConfigurationValue;
import com.rhn.platform.cryptography.api.SecretEncryptionService;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.id.GlobalIds;
import com.rhn.shared.json.JsonCodec;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static com.rhn.ai.api.ClinicalAiConfigurationPermissions.PLATFORM_ROLE;
import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.forbidden;

@Service
public class ClinicalAiAdministrationService {
    private static final List<Descriptor> DESCRIPTORS = List.of(
            descriptor("mode", "运行策略", "AI运行模式", "控制关闭、本地规则辅助或模型辅助", "STRING"),
            descriptor("model", "模型服务", "临床模型标识", "OpenAI-compatible 请求使用的模型名称", "STRING"),
            descriptor("endpoint", "模型服务", "模型服务地址", "Chat Completions 完整 HTTP/HTTPS 地址", "STRING"),
            secret("api-key", "模型服务", "模型服务 API Key", "仅在服务端加密存储，保存后不回传明文"),
            descriptor("request-timeout-seconds", "模型服务", "请求超时", "模型、语音和知识请求的最长等待秒数", "NUMBER"),
            descriptor("max-output-tokens", "模型服务", "最大输出 Token", "单次模型建议的最大输出量", "NUMBER"),
            descriptor("suggestion-ttl-minutes", "临床治理", "建议有效期", "建议生成后允许采纳的分钟数", "NUMBER"),
            descriptor("rollout-percentage", "临床治理", "医生灰度比例", "按执业人员稳定分桶启用的百分比", "NUMBER"),
            descriptor("voice-enabled", "语音能力", "启用语音转写", "是否允许调用服务端语音转写", "BOOLEAN"),
            descriptor("voice-max-audio-mb", "语音能力", "单次录音上限", "上传音频的最大 MB 数", "NUMBER"),
            descriptor("speech-endpoint", "语音能力", "语音服务地址", "Audio Transcriptions 完整 HTTP/HTTPS 地址", "STRING"),
            descriptor("speech-model", "语音能力", "语音模型标识", "语音转写请求使用的模型名称", "STRING"),
            descriptor("knowledge-enabled", "知识能力", "启用医学知识检索", "是否允许调用医学知识服务", "BOOLEAN"),
            descriptor("knowledge-max-results", "知识能力", "知识结果上限", "单次返回的可追溯知识结果数量", "NUMBER"),
            descriptor("knowledge-endpoint", "知识能力", "医学知识服务地址", "PMPHAI-compatible 完整 HTTP/HTTPS 地址", "STRING"),
            secret("knowledge-api-key", "知识能力", "医学知识 API Key", "未单独配置时使用模型服务 API Key"));
    private static final Map<String, Descriptor> BY_KEY = DESCRIPTORS.stream()
            .collect(java.util.stream.Collectors.toUnmodifiableMap(Descriptor::key, value -> value));

    private final ConfigurationAdministration configurationAdministration;
    private final ClinicalAiRuntimePolicy runtimePolicy;
    private final ClinicalAssistantSettings fallback;
    private final SecretEncryptionService secretEncryption;
    private final ExecutionContextProvider contextProvider;
    private final JsonCodec jsonCodec;

    public ClinicalAiAdministrationService(ConfigurationAdministration configurationAdministration,
                                            ClinicalAiRuntimePolicy runtimePolicy,
                                            ClinicalAssistantSettings fallback,
                                            SecretEncryptionService secretEncryption,
                                            ExecutionContextProvider contextProvider,
                                            JsonCodec jsonCodec) {
        this.configurationAdministration = configurationAdministration;
        this.runtimePolicy = runtimePolicy;
        this.fallback = fallback;
        this.secretEncryption = secretEncryption;
        this.contextProvider = contextProvider;
        this.jsonCodec = jsonCodec;
    }

    @Transactional(readOnly = true)
    public ConfigurationView configuration(Scope scope) {
        ExecutionContext context = contextProvider.requireCurrent();
        requireScope(scope, context);
        ClinicalAssistantSettings runtime = runtimePolicy.current(context);
        List<SettingView> settings = DESCRIPTORS.stream().map(descriptor -> view(descriptor, scope, context)).toList();
        return new ConfigurationView(scope, canManagePlatform(context), secretEncryption.available(),
                secretEncryption.keyId(), new RuntimeStatus(runtime.mode().name(), runtime.availableFor(context),
                runtime.mode() == ClinicalAssistantSettings.Mode.MODEL && runtime.endpoint() != null && runtime.model() != null,
                runtime.speechAvailable(), runtime.knowledgeAvailable(), runtime.provider(), runtime.model()), settings);
    }

    @Transactional
    public ConfigurationView update(UpdateRequest request) {
        ExecutionContext context = contextProvider.requireCurrent();
        requireScope(request.scope(), context);
        Set<String> submitted = new HashSet<>();
        for (SettingUpdate update : request.settings()) {
            Descriptor descriptor = BY_KEY.get(update.key());
            if (descriptor == null || !submitted.add(update.key())) {
                throw badRequest("AI_CONFIGURATION_KEY_INVALID", "AI 配置项不存在或重复提交");
            }
            save(descriptor, update, request.scope(), context, request.reason());
        }
        return configuration(request.scope());
    }

    private void save(Descriptor descriptor, SettingUpdate update, Scope scope,
                      ExecutionContext context, String reason) {
        String key = ClinicalAiRuntimePolicy.PREFIX + descriptor.key();
        ValueMode mode = ValueMode.OVERRIDE;
        String valueJson = null;
        String secretRef = null;
        if (Boolean.TRUE.equals(update.clearOverride())) {
            if (update.value() != null || clean(update.secretValue()) != null || Boolean.TRUE.equals(update.clearSecret())) {
                throw badRequest("AI_CONFIGURATION_RESET_CONFLICT", "恢复继承时不能同时提交新值");
            }
            configurationAdministration.saveValue(key, new ManagedValueCommand(update.expectedRevision(),
                    administrationScope(scope), scope == Scope.TENANT ? context.tenantId() : null,
                    ValueMode.INHERIT, null, null, clean(reason), requestCode()));
            return;
        }
        if (descriptor.secret()) {
            String plaintext = clean(update.secretValue());
            if (Boolean.TRUE.equals(update.clearSecret()) && plaintext != null) {
                throw badRequest("AI_SECRET_UPDATE_CONFLICT", "不能同时更新并清除同一个密钥");
            }
            if (!Boolean.TRUE.equals(update.clearSecret()) && plaintext == null) return;
            if (Boolean.TRUE.equals(update.clearSecret())) {
                mode = ValueMode.INHERIT;
            } else {
                String scopeCode = scope == Scope.PLATFORM ? "PLATFORM" : "TENANT:" + context.tenantId();
                secretRef = secretEncryption.encrypt(plaintext, ClinicalAiRuntimePolicy.binding(scopeCode, key));
            }
        } else {
            if (update.value() == null || update.value().isNull()) {
                throw badRequest("AI_CONFIGURATION_VALUE_REQUIRED", "配置值不能为空：" + key);
            }
            valueJson = jsonCodec.write(update.value());
        }
        configurationAdministration.saveValue(key, new ManagedValueCommand(update.expectedRevision(),
                administrationScope(scope), scope == Scope.TENANT ? context.tenantId() : null,
                mode, valueJson, secretRef, clean(reason), requestCode()));
    }

    private SettingView view(Descriptor descriptor, Scope scope, ExecutionContext context) {
        String key = ClinicalAiRuntimePolicy.PREFIX + descriptor.key();
        String scopeCode = scope == Scope.PLATFORM ? "PLATFORM" : "TENANT:" + context.tenantId();
        ManagedValue override = configurationAdministration.findValue(key, scopeCode).orElse(null);
        ConfigurationValue resolved = scope == Scope.TENANT
                ? runtimePolicy.resolved(context.tenantId(), descriptor.key()) : null;
        JsonNode effectiveValue = null;
        String sourceScope = "DEPLOYMENT";
        boolean inherited = false;
        boolean secretConfigured;
        if (descriptor.secret()) {
            String fallbackSecret = "api-key".equals(descriptor.key()) ? fallback.apiKey() : fallback.knowledgeApiKey();
            String secretReference = resolved == null ? activeSecretRef(override) : resolved.secretReference();
            secretConfigured = secretReference != null || clean(fallbackSecret) != null;
            if (resolved != null && resolved.secretReference() != null) {
                sourceScope = resolved.resolvedScope();
                inherited = resolved.inherited();
            } else if (scope == Scope.PLATFORM && activeSecretRef(override) != null) {
                sourceScope = "PLATFORM";
            }
        } else {
            secretConfigured = false;
            if (scope == Scope.TENANT && resolved != null) {
                effectiveValue = resolved.value();
                sourceScope = resolved.resolvedScope();
                inherited = resolved.inherited();
            } else if (scope == Scope.PLATFORM && override != null && override.active()
                    && override.valueMode() == ValueMode.OVERRIDE) {
                effectiveValue = jsonCodec.readTree(override.valueJson());
                sourceScope = "PLATFORM";
            } else {
                effectiveValue = fallbackValue(descriptor.key());
            }
        }
        return new SettingView(descriptor.key(), descriptor.group(), descriptor.name(), descriptor.description(),
                descriptor.valueType(), descriptor.secret(), effectiveValue, sourceScope, inherited, secretConfigured,
                override != null, override == null ? null : override.revision(), override != null && override.active());
    }

    private JsonNode fallbackValue(String key) {
        Object value = switch (key) {
            case "mode" -> fallback.mode().name();
            case "model" -> fallback.model();
            case "endpoint" -> fallback.endpoint() == null ? null : fallback.endpoint().toString();
            case "request-timeout-seconds" -> fallback.requestTimeout().toSeconds();
            case "max-output-tokens" -> fallback.maxOutputTokens();
            case "suggestion-ttl-minutes" -> fallback.suggestionTtl().toMinutes();
            case "rollout-percentage" -> fallback.rolloutPercentage();
            case "voice-enabled" -> fallback.speechAvailable();
            case "voice-max-audio-mb" -> fallback.maxAudioBytes() / (1024 * 1024);
            case "speech-endpoint" -> fallback.speechEndpoint() == null ? null : fallback.speechEndpoint().toString();
            case "speech-model" -> fallback.speechModel();
            case "knowledge-enabled" -> fallback.knowledgeAvailable();
            case "knowledge-max-results" -> fallback.maxKnowledgeResults();
            case "knowledge-endpoint" -> fallback.knowledgeEndpoint() == null ? null : fallback.knowledgeEndpoint().toString();
            default -> null;
        };
        return value == null ? null : jsonCodec.readTree(jsonCodec.write(value));
    }

    private void requireScope(Scope scope, ExecutionContext context) {
        if (scope != Scope.PLATFORM && scope != Scope.TENANT) {
            throw badRequest("AI_CONFIGURATION_SCOPE_RESTRICTED", "AI 参数仅允许平台和租户作用域");
        }
        if (scope == Scope.PLATFORM && !canManagePlatform(context)) {
            throw forbidden("AI_PLATFORM_CONFIGURATION_FORBIDDEN", "只有 AI 配置管理员可以维护平台默认值");
        }
    }

    private boolean canManagePlatform(ExecutionContext context) {
        return context.hasAuthority(PLATFORM_ROLE) || context.hasAuthority("ROLE_ADMIN");
    }

    private String activeSecretRef(ManagedValue value) {
        return value != null && value.active() && value.valueMode() == ValueMode.OVERRIDE
                ? value.secretReference() : null;
    }

    private ConfigurationAdministration.Scope administrationScope(Scope scope) {
        return ConfigurationAdministration.Scope.valueOf(scope.name());
    }

    private String requestCode() {
        return "AI_CONFIG_" + GlobalIds.external(GlobalIds.next());
    }

    private static String clean(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static Descriptor descriptor(String key, String group, String name, String description, String valueType) {
        return new Descriptor(key, group, name, description, valueType, false);
    }

    private static Descriptor secret(String key, String group, String name, String description) {
        return new Descriptor(key, group, name, description, "STRING", true);
    }

    private record Descriptor(String key, String group, String name, String description,
                              String valueType, boolean secret) {
    }
}
