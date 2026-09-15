package com.rhn.ai.application;

import com.rhn.ai.api.ClinicalAiAdministrationContracts.ConfigurationTestRequest;
import com.rhn.ai.api.ClinicalAiAdministrationContracts.ConfigurationTestResult;
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

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import static com.rhn.platform.configuration.api.ClinicalAiConfigurationPermissions.PLATFORM_ROLE;
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

    @Transactional(readOnly = true)
    public ConfigurationTestResult test(ConfigurationTestRequest request) {
        ExecutionContext context = contextProvider.requireCurrent();
        requireScope(request.scope(), context);
        String target = request.target() == null ? "MODEL" : request.target().trim().toUpperCase(Locale.ROOT);
        if ("SPEECH".equals(target)) {
            return testSpeech(request, context);
        }
        return testModel(request, context);
    }

    private ConfigurationTestResult testModel(ConfigurationTestRequest request, ExecutionContext context) {
        String endpoint = clean(request.endpoint());
        if (endpoint == null) {
            endpoint = resolveText("endpoint", request.scope(), context);
        }
        if (endpoint == null || (!endpoint.startsWith("http://") && !endpoint.startsWith("https://"))) {
            return new ConfigurationTestResult("MODEL", false, 0, 0,
                    "模型服务地址为空或格式不合法，请输入以 http:// 或 https:// 开头的完整服务地址", null);
        }

        String model = clean(request.model());
        if (model == null) {
            model = resolveText("model", request.scope(), context);
        }
        if (model == null) {
            return new ConfigurationTestResult("MODEL", false, 0, 0,
                    "临床模型标识未配置，请填写模型标识 (如 qwen-plus、glm-4 或 deepseek-chat)", null);
        }

        String apiKey = clean(request.secretValue());
        if (apiKey == null) {
            apiKey = resolveSecret("api-key", request.scope(), context);
        }

        int timeout = request.timeoutSeconds() != null && request.timeoutSeconds() >= 3 && request.timeoutSeconds() <= 60
                ? request.timeoutSeconds() : 12;

        HttpClient probeClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(Math.min(timeout, 8)))
                .build();

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", model);
        body.put("messages", List.of(Map.of("role", "user", "content", "Hello, please respond with ok")));
        body.put("max_tokens", 10);
        ClinicalAiRequestOptions.applyNonThinkingDefault(body, URI.create(endpoint), model);

        long start = System.nanoTime();
        try {
            HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(endpoint))
                    .timeout(Duration.ofSeconds(timeout))
                    .header("Content-Type", "application/json")
                    .header("Accept", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(jsonCodec.write(body)));

            if (apiKey != null && !apiKey.isBlank()) {
                builder.header("Authorization", "Bearer " + apiKey.trim());
            }

            HttpResponse<String> response = probeClient.send(builder.build(), HttpResponse.BodyHandlers.ofString());
            long latencyMs = (System.nanoTime() - start) / 1_000_000;
            int code = response.statusCode();
            String respBody = response.body() == null ? "" : response.body().trim();
            String truncatedBody = respBody.length() > 600 ? respBody.substring(0, 600) + "..." : respBody;

            if (code >= 200 && code < 300) {
                return new ConfigurationTestResult("MODEL", true, code, latencyMs,
                        String.format(Locale.ROOT, "模型服务连通正常！模型响应就绪 (耗时 %d ms)。", latencyMs),
                        truncatedBody);
            } else if (code == 401) {
                return new ConfigurationTestResult("MODEL", false, code, latencyMs,
                        "认证失败 (HTTP 401)：模型服务 API Key 无效或未授权，请检查密钥是否正确。",
                        truncatedBody);
            } else if (code == 403) {
                boolean quota = truncatedBody.toLowerCase(Locale.ROOT).contains("quota")
                        || truncatedBody.toLowerCase(Locale.ROOT).contains("balance")
                        || truncatedBody.toLowerCase(Locale.ROOT).contains("freetier");
                String msg = quota
                        ? "访问受限 (HTTP 403)：账号余额不足或免费额度已耗尽 (Free quota exhausted)，请前往云厂商控制台充值或开启计费。"
                        : "访问拒绝 (HTTP 403)：当前 API Key 无权访问该模型，请检查云厂商账号权限。";
                return new ConfigurationTestResult("MODEL", false, code, latencyMs, msg, truncatedBody);
            } else if (code == 404) {
                return new ConfigurationTestResult("MODEL", false, code, latencyMs,
                        "服务或模型未找到 (HTTP 404)：请核对服务地址完整路径 (是否需带 /chat/completions) 或模型标识拼写是否正确。",
                        truncatedBody);
            } else if (code == 429) {
                return new ConfigurationTestResult("MODEL", false, code, latencyMs,
                        "触发流控限流 (HTTP 429)：请求速率或并发量已达上游提供商上限，请稍后重试。",
                        truncatedBody);
            } else if (code == 400) {
                return new ConfigurationTestResult("MODEL", false, code, latencyMs,
                        "请求参数受限 (HTTP 400)：模型服务未接受测试请求参数，请参考原始报错信息。",
                        truncatedBody);
            } else {
                return new ConfigurationTestResult("MODEL", false, code, latencyMs,
                        String.format(Locale.ROOT, "模型服务返回非成功状态码 HTTP %d，请核对服务配置与状态。", code),
                        truncatedBody);
            }
        } catch (HttpTimeoutException exception) {
            long latencyMs = (System.nanoTime() - start) / 1_000_000;
            return new ConfigurationTestResult("MODEL", false, 504, latencyMs,
                    String.format(Locale.ROOT, "请求超时 (超过 %d 秒)：无法在规定时间内连通模型服务，可能由于模型名称不存在、上游服务挂起或网络严重延迟。", timeout),
                    exception.getMessage());
        } catch (java.net.ConnectException exception) {
            long latencyMs = (System.nanoTime() - start) / 1_000_000;
            return new ConfigurationTestResult("MODEL", false, 502, latencyMs,
                    "网络连接失败：目标主机无法连通、端口未开放或防火墙阻断，请检查服务地址与网络环境。",
                    exception.getMessage());
        } catch (Exception exception) {
            long latencyMs = (System.nanoTime() - start) / 1_000_000;
            return new ConfigurationTestResult("MODEL", false, 0, latencyMs,
                    "测试探针执行异常：" + (exception.getMessage() != null ? exception.getMessage() : exception.getClass().getSimpleName()),
                    exception.toString());
        }
    }

    private static final byte[] DUMMY_WAV = new byte[]{
            'R', 'I', 'F', 'F', 36, 0, 0, 0, 'W', 'A', 'V', 'E',
            'f', 'm', 't', ' ', 16, 0, 0, 0, 1, 0, 1, 0, 68, -84, 0, 0, -120, 88, 1, 0, 2, 0, 16, 0,
            'd', 'a', 't', 'a', 0, 0, 0, 0
    };

    private ConfigurationTestResult testSpeech(ConfigurationTestRequest request, ExecutionContext context) {
        String endpoint = clean(request.endpoint());
        if (endpoint == null) {
            endpoint = resolveText("speech-endpoint", request.scope(), context);
        }
        if (endpoint == null || (!endpoint.startsWith("http://") && !endpoint.startsWith("https://"))) {
            return new ConfigurationTestResult("SPEECH", false, 0, 0,
                    "语音服务地址为空或格式不合法，请输入以 http:// 或 https:// 开头的完整服务地址", null);
        }

        String model = clean(request.model());
        if (model == null) {
            model = resolveText("speech-model", request.scope(), context);
        }
        if (model == null) model = "gpt-transcribe";

        String apiKey = clean(request.secretValue());
        if (apiKey == null) {
            apiKey = resolveSecret("api-key", request.scope(), context);
        }

        int timeout = request.timeoutSeconds() != null && request.timeoutSeconds() >= 3 && request.timeoutSeconds() <= 60
                ? request.timeoutSeconds() : 12;

        HttpClient probeClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(Math.min(timeout, 8)))
                .build();
        String targetEndpoint = endpoint;
        boolean isDashScope = endpoint.contains("dashscope.aliyuncs.com")
                || endpoint.contains("/services/audio/asr/transcription")
                || model.toLowerCase(Locale.ROOT).startsWith("qwen")
                || model.toLowerCase(Locale.ROOT).startsWith("paraformer")
                || model.toLowerCase(Locale.ROOT).startsWith("sensevoice");

        if (isDashScope && !targetEndpoint.contains("/services/audio/asr/transcription")) {
            targetEndpoint = "https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription";
        }

        long start = System.nanoTime();
        try {
            HttpRequest httpRequest;
            if (isDashScope) {
                // DashScope ASR 协议：JSON 负载 + X-DashScope-Async: enable + Data URI 音频
                String dataUrl = "data:audio/wav;base64," + java.util.Base64.getEncoder().encodeToString(DUMMY_WAV);
                String effectiveModel = model;
                if ("qwen3-asr-flash".equalsIgnoreCase(effectiveModel)) {
                    effectiveModel = "qwen3-asr-flash-filetrans";
                }
                String jsonBody = String.format(Locale.ROOT,
                        "{\"model\":\"%s\",\"input\":{\"file_url\":\"%s\"},\"parameters\":{\"enable_words\":false}}",
                        effectiveModel, dataUrl);
                HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(targetEndpoint))
                        .timeout(Duration.ofSeconds(timeout))
                        .header("Content-Type", "application/json")
                        .header("Accept", "application/json")
                        .header("X-DashScope-Async", "enable")
                        .POST(HttpRequest.BodyPublishers.ofString(jsonBody, StandardCharsets.UTF_8));
                if (apiKey != null && !apiKey.isBlank()) {
                    b.header("Authorization", "Bearer " + apiKey.trim());
                }
                httpRequest = b.build();
            } else {
                // 标准 OpenAI-compatible 协议：multipart/form-data
                String boundary = "rhn-test-speech-" + Long.toUnsignedString(GlobalIds.next(), 36);
                byte[] prefix = ("--" + boundary + "\r\n"
                        + "Content-Disposition: form-data; name=\"model\"\r\n\r\n" + model + "\r\n"
                        + "--" + boundary + "\r\n"
                        + "Content-Disposition: form-data; name=\"file\"; filename=\"test.wav\"\r\n"
                        + "Content-Type: audio/wav\r\n\r\n").getBytes(StandardCharsets.UTF_8);
                byte[] suffix = ("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8);

                HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(targetEndpoint))
                        .timeout(Duration.ofSeconds(timeout))
                        .header("Content-Type", "multipart/form-data; boundary=" + boundary)
                        .header("Accept", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofByteArrays(List.of(prefix, DUMMY_WAV, suffix)));
                if (apiKey != null && !apiKey.isBlank()) {
                    b.header("Authorization", "Bearer " + apiKey.trim());
                }
                httpRequest = b.build();
            }

            HttpResponse<String> response = probeClient.send(httpRequest, HttpResponse.BodyHandlers.ofString());
            long latencyMs = (System.nanoTime() - start) / 1_000_000;
            int code = response.statusCode();
            String respBody = response.body() == null ? "" : response.body().trim();
            String truncatedBody = respBody.length() > 600 ? respBody.substring(0, 600) + "..." : respBody;

            if (code >= 200 && code < 300) {
                String desc = isDashScope
                        ? String.format(Locale.ROOT, "千问语音服务连通正常！DashScope ASR 握手与鉴权通过 (耗时 %d ms)。", latencyMs)
                        : String.format(Locale.ROOT, "语音转写服务连通正常！响应就绪 (耗时 %d ms)。", latencyMs);
                return new ConfigurationTestResult("SPEECH", true, code, latencyMs, desc, truncatedBody);
            } else if (code == 400) {
                // 如果是格式校验，检查具体错误
                if (respBody.contains("Model") || respBody.contains("not found") || respBody.contains("InvalidParameter")) {
                    return new ConfigurationTestResult("SPEECH", false, code, latencyMs,
                            "参数校验失败 (HTTP 400)：模型标识无效或参数格式受限，请确认模型是否为 qwen3-asr-flash-filetrans / sensevoice-v1 等。",
                            truncatedBody);
                }
                return new ConfigurationTestResult("SPEECH", true, code, latencyMs,
                        String.format(Locale.ROOT, "语音端点与鉴权连通通过 (HTTP 400 校验音频格式)，耗时 %d ms。", latencyMs),
                        truncatedBody);
            } else if (code == 401) {
                return new ConfigurationTestResult("SPEECH", false, code, latencyMs,
                        "认证失败 (HTTP 401)：语音服务 API Key 无效或未授权，请检查密钥是否正确。",
                        truncatedBody);
            } else if (code == 403) {
                boolean quota = respBody.contains("Quota") || respBody.contains("exhausted") || respBody.contains("FreeTierOnly");
                String msg = quota
                        ? "访问受限 (HTTP 403)：账号余额不足或免费额度已耗尽，请前往阿里云控制台开通或充值语音服务。"
                        : "访问拒绝 (HTTP 403)：当前 API Key 无权调用该语音模型，请在阿里云控制台检查语音服务开通状态。";
                return new ConfigurationTestResult("SPEECH", false, code, latencyMs, msg, truncatedBody);
            } else if (code == 404) {
                return new ConfigurationTestResult("SPEECH", false, code, latencyMs,
                        "服务地址未找到 (HTTP 404)：请核对语音服务地址完整路径 (千问语音请使用 /api/v1/services/audio/asr/transcription)。",
                        truncatedBody);
            } else {
                return new ConfigurationTestResult("SPEECH", false, code, latencyMs,
                        String.format(Locale.ROOT, "语音服务返回非成功状态码 HTTP %d，请核对服务配置与状态。", code),
                        truncatedBody);
            }
        } catch (HttpTimeoutException exception) {
            long latencyMs = (System.nanoTime() - start) / 1_000_000;
            return new ConfigurationTestResult("SPEECH", false, 504, latencyMs,
                    String.format(Locale.ROOT, "语音请求超时 (超过 %d 秒)：请检查语音地址端口及网络延迟 (如避免误填 :9443 端口)。", timeout),
                    exception.getMessage());
        } catch (java.net.ConnectException exception) {
            long latencyMs = (System.nanoTime() - start) / 1_000_000;
            return new ConfigurationTestResult("SPEECH", false, 502, latencyMs,
                    "网络连接失败：目标语音主机无法连通或端口未开放，请核实地址与端口是否正确。",
                    exception.getMessage());
        } catch (Exception exception) {
            long latencyMs = (System.nanoTime() - start) / 1_000_000;
            return new ConfigurationTestResult("SPEECH", false, 0, latencyMs,
                    "语音测试探针执行异常：" + (exception.getMessage() != null ? exception.getMessage() : exception.getClass().getSimpleName()),
                    exception.toString());
        }
    }

    private String resolveText(String key, Scope scope, ExecutionContext context) {
        if (scope == Scope.TENANT) {
            ConfigurationValue resolved = runtimePolicy.resolved(context.tenantId(), key);
            if (resolved != null && resolved.value() != null && !resolved.value().isNull() && !resolved.value().asString().isBlank()) {
                return resolved.value().asString().trim();
            }
        }
        String fullKey = ClinicalAiRuntimePolicy.PREFIX + key;
        ManagedValue platformOverride = configurationAdministration.findValue(fullKey, "PLATFORM").orElse(null);
        if (platformOverride != null && platformOverride.active() && platformOverride.valueMode() == ValueMode.OVERRIDE
                && platformOverride.valueJson() != null) {
            try {
                JsonNode node = jsonCodec.readTree(platformOverride.valueJson());
                if (node != null && !node.isNull() && !node.asString().isBlank()) {
                    return node.asString().trim();
                }
            } catch (RuntimeException ignored) {
            }
        }
        JsonNode fallbackNode = fallbackValue(key);
        return fallbackNode == null || fallbackNode.isNull() || fallbackNode.asString().isBlank() ? null : fallbackNode.asString().trim();
    }

    private String resolveSecret(String key, Scope scope, ExecutionContext context) {
        String fullKey = ClinicalAiRuntimePolicy.PREFIX + key;
        String scopeCode = scope == Scope.PLATFORM ? "PLATFORM" : "TENANT:" + context.tenantId();
        ManagedValue override = configurationAdministration.findValue(fullKey, scopeCode).orElse(null);
        if (override != null && override.active() && override.valueMode() == ValueMode.OVERRIDE && override.secretReference() != null) {
            return secretEncryption.decrypt(override.secretReference(), ClinicalAiRuntimePolicy.binding(scopeCode, fullKey));
        }
        if (scope == Scope.TENANT) {
            ConfigurationValue resolved = runtimePolicy.resolved(context.tenantId(), key);
            if (resolved != null && resolved.secretReference() != null) {
                return runtimePolicy.decrypt(resolved);
            }
        }
        ManagedValue platformOverride = configurationAdministration.findValue(fullKey, "PLATFORM").orElse(null);
        if (platformOverride != null && platformOverride.active() && platformOverride.valueMode() == ValueMode.OVERRIDE && platformOverride.secretReference() != null) {
            return secretEncryption.decrypt(platformOverride.secretReference(), ClinicalAiRuntimePolicy.binding("PLATFORM", fullKey));
        }
        return "api-key".equals(key) ? fallback.apiKey() : fallback.knowledgeApiKey();
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
