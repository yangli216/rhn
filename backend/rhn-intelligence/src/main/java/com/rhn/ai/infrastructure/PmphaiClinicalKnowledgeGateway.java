package com.rhn.ai.infrastructure;

import com.rhn.ai.application.ClinicalAiModelException;
import com.rhn.ai.application.ClinicalAssistantSettings;
import com.rhn.ai.application.ClinicalKnowledgeGateway;
import com.rhn.shared.json.JsonCodec;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

@Component
final class PmphaiClinicalKnowledgeGateway implements ClinicalKnowledgeGateway {
    private final ClinicalAssistantSettings settings;
    private final JsonCodec jsonCodec;
    private final HttpClient httpClient;

    @Autowired
    PmphaiClinicalKnowledgeGateway(ClinicalAssistantSettings settings, JsonCodec jsonCodec) {
        this(settings, jsonCodec, HttpClient.newBuilder().connectTimeout(settings.requestTimeout()).build());
    }

    PmphaiClinicalKnowledgeGateway(ClinicalAssistantSettings settings, JsonCodec jsonCodec, HttpClient httpClient) {
        this.settings = settings;
        this.jsonCodec = jsonCodec;
        this.httpClient = httpClient;
    }

    @Override
    public List<KnowledgeResult> search(String query, int limit, ClinicalAssistantSettings runtimeSettings) {
        ClinicalAssistantSettings active = runtimeSettings == null ? settings : runtimeSettings;
        if (!active.knowledgeAvailable()) throw new ClinicalAiModelException("医学知识服务配置不完整");
        String body = jsonCodec.write(Map.of(
                "query", query,
                "type", 1,
                "limit", limit,
                "enableAbstract", true));
        HttpRequest.Builder builder = HttpRequest.newBuilder(active.knowledgeEndpoint())
                .timeout(active.requestTimeout())
                .header("Content-Type", "application/json")
                .header("Accept", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body));
        if (active.knowledgeApiKey() != null) {
            builder.header("Authorization", "Bearer " + active.knowledgeApiKey());
        }
        try {
            HttpResponse<String> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new ClinicalAiModelException("医学知识服务返回非成功状态：" + response.statusCode());
            }
            ProviderResult[] results = jsonCodec.read(response.body(), ProviderResult[].class);
            if (results == null) return List.of();
            return Arrays.stream(results).limit(limit).map(value -> new KnowledgeResult(
                    value.id(), value.name(), firstText(value.aiAbstract(), value.content()), value.score(),
                    value.sourceInfo() == null ? null : value.sourceInfo().knowledgeLibName(),
                    value.sourceInfo() == null ? null : value.sourceInfo().knowledgeLibId(),
                    value.sourceInfo() == null ? null : value.sourceInfo().publishYear(),
                    value.resourcePos())).toList();
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new ClinicalAiModelException("医学知识请求被中断", exception);
        } catch (IOException | RuntimeException exception) {
            if (exception instanceof ClinicalAiModelException modelException) throw modelException;
            throw new ClinicalAiModelException("医学知识服务调用或结果解析失败", exception);
        }
    }

    List<KnowledgeResult> search(String query, int limit) {
        return search(query, limit, settings);
    }

    private static String firstText(String preferred, String fallback) {
        return preferred == null || preferred.isBlank() ? fallback : preferred;
    }

    private record ProviderResult(String id, String name, String content, Double score,
                                  String resourcePos, SourceInfo sourceInfo, String aiAbstract) {}

    private record SourceInfo(String knowledgeLibName, String knowledgeLibId, String publishYear) {}
}
