package com.rhn.ai.infrastructure;

import com.rhn.ai.application.ClinicalAiModelException;
import com.rhn.ai.application.ClinicalAiSpeechGateway;
import com.rhn.ai.application.ClinicalAssistantSettings;
import com.rhn.shared.id.GlobalIds;
import com.rhn.shared.json.JsonCodec;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;

import java.io.IOException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.List;

@Component
final class OpenAiCompatibleClinicalAiSpeechGateway implements ClinicalAiSpeechGateway {
    private final ClinicalAssistantSettings settings;
    private final JsonCodec jsonCodec;
    private final HttpClient httpClient;

    @Autowired
    OpenAiCompatibleClinicalAiSpeechGateway(ClinicalAssistantSettings settings, JsonCodec jsonCodec) {
        this(settings, jsonCodec, HttpClient.newBuilder().connectTimeout(settings.requestTimeout()).build());
    }

    OpenAiCompatibleClinicalAiSpeechGateway(ClinicalAssistantSettings settings, JsonCodec jsonCodec,
                                             HttpClient httpClient) {
        this.settings = settings;
        this.jsonCodec = jsonCodec;
        this.httpClient = httpClient;
    }

    @Override
    public String transcribe(SpeechRequest request, ClinicalAssistantSettings runtimeSettings) {
        ClinicalAssistantSettings active = runtimeSettings == null ? settings : runtimeSettings;
        if (!active.speechAvailable()) throw new ClinicalAiModelException("语音转写服务配置不完整");

        if (isDashScope(active.speechEndpoint(), active.speechModel())) {
            return transcribeDashScope(request, active);
        }
        return transcribeOpenAi(request, active);
    }

    private boolean isDashScope(java.net.URI endpoint, String model) {
        if (endpoint != null) {
            String ep = endpoint.toString().toLowerCase(java.util.Locale.ROOT);
            if (ep.contains("dashscope.aliyuncs.com") || ep.contains("/services/audio/asr/transcription")) {
                return true;
            }
        }
        if (model != null) {
            String m = model.toLowerCase(java.util.Locale.ROOT);
            return m.startsWith("qwen") || m.startsWith("paraformer") || m.startsWith("sensevoice");
        }
        return false;
    }

    private String transcribeDashScope(SpeechRequest request, ClinicalAssistantSettings active) {
        java.net.URI endpoint = active.speechEndpoint();
        String endpointStr = endpoint == null ? "" : endpoint.toString();
        if (!endpointStr.contains("/services/audio/asr/transcription")) {
            endpoint = java.net.URI.create("https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription");
        }
        String model = active.speechModel();
        if ("qwen3-asr-flash".equalsIgnoreCase(model)) {
            model = "qwen3-asr-flash-filetrans";
        }
        String mime = request.contentType();
        if (mime != null && mime.contains(";")) {
            mime = mime.substring(0, mime.indexOf(';')).trim();
        }
        if (mime == null || mime.isBlank()) mime = "audio/wav";
        String dataUrl = "data:" + mime + ";base64," + java.util.Base64.getEncoder().encodeToString(request.audio());

        // 1. 提交异步转写任务
        String jsonPayload = String.format(java.util.Locale.ROOT,
                "{\"model\":\"%s\",\"input\":{\"file_url\":\"%s\"},\"parameters\":{\"enable_words\":false}}",
                model, dataUrl);

        HttpRequest.Builder submitBuilder = HttpRequest.newBuilder(endpoint)
                .timeout(java.time.Duration.ofSeconds(15))
                .header("Content-Type", "application/json")
                .header("Accept", "application/json")
                .header("X-DashScope-Async", "enable")
                .POST(HttpRequest.BodyPublishers.ofString(jsonPayload, StandardCharsets.UTF_8));
        if (active.apiKey() != null && !active.apiKey().isBlank()) {
            submitBuilder.header("Authorization", "Bearer " + active.apiKey().trim());
        }

        try {
            HttpResponse<String> submitResponse = httpClient.send(submitBuilder.build(), HttpResponse.BodyHandlers.ofString());
            if (submitResponse.statusCode() < 200 || submitResponse.statusCode() >= 300) {
                String body = submitResponse.body();
                throw new ClinicalAiModelException("DashScope 语音服务提交失败 (HTTP " + submitResponse.statusCode() + "): " + body);
            }
            JsonNode submitNode = jsonCodec.readTree(submitResponse.body());
            JsonNode outputNode = submitNode == null ? null : submitNode.get("output");
            String taskId = outputNode == null || outputNode.get("task_id") == null ? null : outputNode.get("task_id").asString();
            if (taskId == null || taskId.isBlank()) {
                throw new ClinicalAiModelException("DashScope 语音服务未返回 task_id: " + submitResponse.body());
            }

            // 2. 轮询任务状态
            String taskBase = endpoint.getScheme() + "://" + endpoint.getAuthority();
            if (endpoint.getPath() != null && endpoint.getPath().contains("/api/v1")) {
                taskBase += "/api/v1/tasks/";
            } else {
                taskBase += "/tasks/";
            }
            java.net.URI taskUri = java.net.URI.create(taskBase + taskId);
            long deadline = System.currentTimeMillis() + active.requestTimeout().toMillis();
            while (System.currentTimeMillis() < deadline) {
                Thread.sleep(500);
                HttpRequest.Builder taskBuilder = HttpRequest.newBuilder(taskUri)
                        .timeout(java.time.Duration.ofSeconds(8))
                        .header("Accept", "application/json");
                if (active.apiKey() != null && !active.apiKey().isBlank()) {
                    taskBuilder.header("Authorization", "Bearer " + active.apiKey().trim());
                }
                HttpResponse<String> taskResponse = httpClient.send(taskBuilder.build(), HttpResponse.BodyHandlers.ofString());
                if (taskResponse.statusCode() >= 200 && taskResponse.statusCode() < 300) {
                    JsonNode taskNode = jsonCodec.readTree(taskResponse.body());
                    JsonNode taskOutput = taskNode == null ? null : taskNode.get("output");
                    String status = taskOutput == null || taskOutput.get("task_status") == null ? "" : taskOutput.get("task_status").asString();
                    if ("SUCCEEDED".equalsIgnoreCase(status)) {
                        // 提取 transcription_url 并下载结果
                        String transUrl = null;
                        if (taskOutput.get("results") != null && taskOutput.get("results").isArray() && taskOutput.get("results").size() > 0) {
                            transUrl = taskOutput.get("results").get(0).path("transcription_url").asString(null);
                        } else if (taskOutput.get("result") != null) {
                            transUrl = taskOutput.get("result").path("transcription_url").asString(null);
                        }
                        if (transUrl != null && !transUrl.isBlank()) {
                            HttpRequest fetchReq = HttpRequest.newBuilder(java.net.URI.create(transUrl))
                                    .timeout(java.time.Duration.ofSeconds(10))
                                    .GET()
                                    .build();
                            HttpResponse<String> fileResp = httpClient.send(fetchReq, HttpResponse.BodyHandlers.ofString());
                            JsonNode fileNode = jsonCodec.readTree(fileResp.body());
                            if (fileNode != null && fileNode.get("transcripts") != null && fileNode.get("transcripts").isArray() && fileNode.get("transcripts").size() > 0) {
                                String text = fileNode.get("transcripts").get(0).path("text").asString("");
                                if (!text.isBlank()) return text.trim();
                            }
                        }
                        throw new ClinicalAiModelException("DashScope 语音转写成功但未获取到有效文本内容");
                    } else if ("FAILED".equalsIgnoreCase(status)) {
                        String errMsg = taskOutput.path("message").asString("任务执行失败");
                        throw new ClinicalAiModelException("DashScope 语音识别任务失败: " + errMsg);
                    }
                }
            }
            throw new ClinicalAiModelException("DashScope 语音转写超时 (" + active.requestTimeout().toSeconds() + " 秒)");
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new ClinicalAiModelException("DashScope 语音转写请求被中断", exception);
        } catch (IOException | RuntimeException exception) {
            if (exception instanceof ClinicalAiModelException modelException) throw modelException;
            throw new ClinicalAiModelException("DashScope 语音转写服务调用或结果解析失败: " + exception.getMessage(), exception);
        }
    }

    private String transcribeOpenAi(SpeechRequest request, ClinicalAssistantSettings active) {
        String boundary = "rhn-" + Long.toUnsignedString(GlobalIds.next(), 36);
        byte[] prefix = ("--" + boundary + "\r\n"
                + "Content-Disposition: form-data; name=\"model\"\r\n\r\n" + active.speechModel() + "\r\n"
                + "--" + boundary + "\r\n"
                + "Content-Disposition: form-data; name=\"language\"\r\n\r\n" + request.languageHint() + "\r\n"
                + "--" + boundary + "\r\n"
                + "Content-Disposition: form-data; name=\"prompt\"\r\n\r\n"
                + "基层门诊临床口述，忠实转写，不补充未说出的症状、阴性发现、诊断或治疗。\r\n"
                + "--" + boundary + "\r\n"
                + "Content-Disposition: form-data; name=\"file\"; filename=\"" + request.fileName() + "\"\r\n"
                + "Content-Type: " + request.contentType() + "\r\n\r\n").getBytes(StandardCharsets.UTF_8);
        byte[] suffix = ("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8);
        HttpRequest.Builder builder = HttpRequest.newBuilder(active.speechEndpoint())
                .timeout(active.requestTimeout())
                .header("Content-Type", "multipart/form-data; boundary=" + boundary)
                .header("Accept", "application/json")
                .POST(HttpRequest.BodyPublishers.ofByteArrays(List.of(prefix, request.audio(), suffix)));
        if (active.apiKey() != null) builder.header("Authorization", "Bearer " + active.apiKey());
        try {
            HttpResponse<String> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new ClinicalAiModelException("语音转写服务返回非成功状态：" + response.statusCode());
            }
            JsonNode root = jsonCodec.readTree(response.body());
            String text = root == null || root.get("text") == null ? null : root.get("text").asString();
            if (text == null || text.isBlank()) throw new ClinicalAiModelException("语音转写服务未返回文本");
            return text.trim();
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new ClinicalAiModelException("语音转写请求被中断", exception);
        } catch (IOException | RuntimeException exception) {
            if (exception instanceof ClinicalAiModelException modelException) throw modelException;
            throw new ClinicalAiModelException("语音转写服务调用或结果解析失败", exception);
        }
    }

    String transcribe(SpeechRequest request) {
        return transcribe(request, settings);
    }
}
