package com.rhn.ai.infrastructure;

import com.rhn.ai.application.ClinicalAiModelException;
import com.rhn.ai.application.ClinicalAssistantSettings;
import com.rhn.ai.application.ClinicalKnowledgeGateway;
import com.rhn.shared.json.JsonCodec;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
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

    @Override
    public EvidenceChainResult evaluateEvidenceChain(EvidenceChainRequest request, ClinicalAssistantSettings runtimeSettings) {
        ClinicalAssistantSettings active = runtimeSettings == null ? settings : runtimeSettings;
        if (!active.knowledgeAvailable()) throw new ClinicalAiModelException("医学知识服务配置不完整");
        URI targetUri = siblingEndpoint(active.knowledgeEndpoint(), "evidence-chain");
        String body = jsonCodec.write(request);
        HttpRequest.Builder builder = HttpRequest.newBuilder(targetUri)
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
                throw new ClinicalAiModelException("循证推导服务返回非成功状态：" + response.statusCode());
            }
            EvidenceChainResult result = jsonCodec.read(response.body(), EvidenceChainResult.class);
            if (result == null) {
                throw new ClinicalAiModelException("循证推导服务响应为空");
            }
            return result;
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new ClinicalAiModelException("循证推导请求被中断", exception);
        } catch (IOException | RuntimeException exception) {
            if (exception instanceof ClinicalAiModelException modelException) throw modelException;
            throw new ClinicalAiModelException("循证推导服务调用或结果解析失败", exception);
        }
    }

    @Override
    public PreflightSafetyResult evaluatePreflightSafety(PreflightSafetyRequest request, ClinicalAssistantSettings runtimeSettings) {
        ClinicalAssistantSettings active = runtimeSettings == null ? settings : runtimeSettings;
        if (!active.knowledgeAvailable()) throw new ClinicalAiModelException("医学知识服务配置不完整");
        URI targetUri = preflightSafetyEndpoint(active.knowledgeEndpoint());
        String body = jsonCodec.write(request);
        HttpRequest.Builder builder = HttpRequest.newBuilder(targetUri)
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
                throw new ClinicalAiModelException("处方预检安全服务返回非成功状态：" + response.statusCode());
            }
            PreflightSafetyResult result = jsonCodec.read(response.body(), PreflightSafetyResult.class);
            if (result == null) {
                throw new ClinicalAiModelException("处方预检安全服务响应为空");
            }
            return result;
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new ClinicalAiModelException("处方预检安全请求被中断", exception);
        } catch (IOException | RuntimeException exception) {
            if (exception instanceof ClinicalAiModelException modelException) throw modelException;
            throw new ClinicalAiModelException("处方预检安全服务调用或结果解析失败", exception);
        }
    }

    @Override
    public WikiDocResult lookupWikiDoc(String query, String docType, ClinicalAssistantSettings runtimeSettings) {
        ClinicalAssistantSettings active = runtimeSettings == null ? settings : runtimeSettings;
        if (!active.knowledgeAvailable()) throw new ClinicalAiModelException("医学知识服务配置不完整");
        StringBuilder queryParams = new StringBuilder();
        if (query != null && !query.isBlank()) {
            queryParams.append("name=").append(java.net.URLEncoder.encode(query.trim(), java.nio.charset.StandardCharsets.UTF_8));
        }
        if (docType != null && !docType.isBlank()) {
            if (!queryParams.isEmpty()) queryParams.append("&");
            queryParams.append("type=").append(java.net.URLEncoder.encode(docType.trim(), java.nio.charset.StandardCharsets.UTF_8));
        }
        URI docEndpoint = siblingEndpoint(active.knowledgeEndpoint(), "doc");
        URI targetUri = queryParams.isEmpty() ? docEndpoint : URI.create(docEndpoint + "?" + queryParams);
        HttpRequest.Builder builder = HttpRequest.newBuilder(targetUri)
                .timeout(active.requestTimeout())
                .header("Accept", "application/json")
                .GET();
        if (active.knowledgeApiKey() != null) {
            builder.header("Authorization", "Bearer " + active.knowledgeApiKey());
        }
        try {
            HttpResponse<String> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 404) {
                return null;
            }
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new ClinicalAiModelException("知识库文档服务返回非成功状态：" + response.statusCode());
            }
            return jsonCodec.read(response.body(), WikiDocResult.class);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new ClinicalAiModelException("知识库文档请求被中断", exception);
        } catch (IOException | RuntimeException exception) {
            if (exception instanceof ClinicalAiModelException modelException) throw modelException;
            throw new ClinicalAiModelException("知识库文档服务调用或解析失败", exception);
        }
    }

    List<KnowledgeResult> search(String query, int limit) {
        return search(query, limit, settings);
    }

    private static URI preflightSafetyEndpoint(URI searchEndpoint) {
        String path = searchEndpoint.getRawPath();
        if (path != null && path.contains("/knowledge/")) {
            String cdssPath = path.substring(0, path.lastIndexOf("/knowledge/")) + "/cdss/preflight-safety";
            return URI.create(searchEndpoint.getScheme() + "://" + searchEndpoint.getRawAuthority() + cdssPath);
        }
        return siblingEndpoint(searchEndpoint, "preflight-safety");
    }

    private static URI siblingEndpoint(URI searchEndpoint, String operation) {
        String path = searchEndpoint.getRawPath();
        int separator = path == null ? -1 : path.lastIndexOf('/');
        if (searchEndpoint.getScheme() == null || searchEndpoint.getRawAuthority() == null || separator < 0) {
            throw new ClinicalAiModelException("医学知识服务地址必须是完整的检索接口地址");
        }
        String siblingPath = path.substring(0, separator + 1) + operation;
        return URI.create(searchEndpoint.getScheme() + "://" + searchEndpoint.getRawAuthority() + siblingPath);
    }

    private static String firstText(String preferred, String fallback) {
        return preferred == null || preferred.isBlank() ? fallback : preferred;
    }

    private record ProviderResult(String id, String name, String content, Double score,
                                  String resourcePos, SourceInfo sourceInfo, String aiAbstract) {}

    private record SourceInfo(String knowledgeLibName, String knowledgeLibId, String publishYear) {}
}
