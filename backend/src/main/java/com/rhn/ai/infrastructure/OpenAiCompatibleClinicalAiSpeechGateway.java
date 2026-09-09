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
            String text = root == null || root.get("text") == null ? null : root.get("text").asText();
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
