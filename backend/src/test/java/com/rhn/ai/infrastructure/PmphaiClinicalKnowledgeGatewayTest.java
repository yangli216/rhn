package com.rhn.ai.infrastructure;

import com.rhn.ai.application.ClinicalAiModelException;
import com.rhn.ai.application.ClinicalAssistantSettings;
import com.rhn.shared.json.JsonCodec;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PmphaiClinicalKnowledgeGatewayTest {
    private HttpServer server;
    private final JsonCodec jsonCodec = new TestJsonCodec();

    @AfterEach
    void stopServer() {
        if (server != null) server.stop(0);
    }

    @Test
    void sendsServerSideSearchAndPreservesSourceMetadata() throws Exception {
        AtomicReference<String> requestBody = new AtomicReference<>();
        AtomicReference<String> authorization = new AtomicReference<>();
        startServer(exchange -> {
            requestBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            authorization.set(exchange.getRequestHeaders().getFirst("Authorization"));
            byte[] response = """
                    [{
                      "id":"chapter-1","name":"中国高血压防治指南","content":"原始片段",
                      "score":0.92,"resourcePos":"第 3 章 2.1 节","aiAbstract":"血压分级与评估摘要",
                      "sourceInfo":{"knowledgeLibName":"人卫临床知识库","knowledgeLibId":"pmph-1","publishYear":"2024"}
                    }]
                    """.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, response.length);
            exchange.getResponseBody().write(response);
            exchange.close();
        });

        var results = new PmphaiClinicalKnowledgeGateway(settings("knowledge-secret"), jsonCodec)
                .search("原发性高血压", 3);

        assertEquals(1, results.size());
        assertEquals("中国高血压防治指南", results.getFirst().title());
        assertEquals("血压分级与评估摘要", results.getFirst().excerpt());
        assertEquals("人卫临床知识库", results.getFirst().sourceName());
        assertEquals("2024", results.getFirst().publishYear());
        assertEquals("Bearer knowledge-secret", authorization.get());
        assertTrue(requestBody.get().contains("\"query\":\"原发性高血压\""));
        assertTrue(requestBody.get().contains("\"type\":1"));
        assertTrue(requestBody.get().contains("\"limit\":3"));
        assertTrue(requestBody.get().contains("\"enableAbstract\":true"));
    }

    @Test
    void rejectsProviderErrorWithoutLeakingResponseBody() throws Exception {
        startServer(exchange -> {
            byte[] response = "upstream-private-detail".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(502, response.length);
            exchange.getResponseBody().write(response);
            exchange.close();
        });

        ClinicalAiModelException error = assertThrows(ClinicalAiModelException.class,
                () -> new PmphaiClinicalKnowledgeGateway(settings(null), jsonCodec).search("高血压", 3));

        assertEquals("医学知识服务返回非成功状态：502", error.getMessage());
        assertFalse(error.getMessage().contains("upstream-private-detail"));
    }

    private ClinicalAssistantSettings settings(String knowledgeApiKey) {
        return new ClinicalAssistantSettings("MODEL", "test-provider", "test-model", Duration.ofMinutes(30),
                "http://127.0.0.1:9/v1/chat/completions", "model-secret", Duration.ofSeconds(5), 1200,
                "", "gpt-transcribe", 20 * 1024 * 1024,
                "http://127.0.0.1:" + server.getAddress().getPort() + "/v1/knowledge/pmphai/search",
                knowledgeApiKey, 5);
    }

    private void startServer(com.sun.net.httpserver.HttpHandler handler) throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/v1/knowledge/pmphai/search", handler);
        server.start();
    }

    private static final class TestJsonCodec implements JsonCodec {
        private final ObjectMapper mapper = new ObjectMapper();

        @Override
        public String write(Object value) {
            return mapper.writeValueAsString(value);
        }

        @Override
        public JsonNode readTree(String value) {
            return mapper.readTree(value);
        }

        @Override
        public <T> T read(String value, Class<T> type) {
            return mapper.readValue(value, type);
        }

        @Override
        @SuppressWarnings("unchecked")
        public Map<String, Object> readObject(String value) {
            return mapper.readValue(value, LinkedHashMap.class);
        }
    }
}
