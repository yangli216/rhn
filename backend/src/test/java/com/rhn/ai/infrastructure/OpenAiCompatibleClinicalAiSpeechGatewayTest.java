package com.rhn.ai.infrastructure;

import com.rhn.ai.application.ClinicalAiModelException;
import com.rhn.ai.application.ClinicalAiSpeechGateway.SpeechRequest;
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

class OpenAiCompatibleClinicalAiSpeechGatewayTest {
    private HttpServer server;
    private final JsonCodec jsonCodec = new TestJsonCodec();

    @AfterEach
    void stopServer() {
        if (server != null) server.stop(0);
    }

    @Test
    void sendsAuthorizedMultipartRequestAndParsesTranscript() throws Exception {
        AtomicReference<String> contentType = new AtomicReference<>();
        AtomicReference<String> authorization = new AtomicReference<>();
        AtomicReference<byte[]> requestBody = new AtomicReference<>();
        startServer(exchange -> {
            contentType.set(exchange.getRequestHeaders().getFirst("Content-Type"));
            authorization.set(exchange.getRequestHeaders().getFirst("Authorization"));
            requestBody.set(exchange.getRequestBody().readAllBytes());
            byte[] response = "{\"text\":\"  患者咳嗽三天。  \"}".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, response.length);
            exchange.getResponseBody().write(response);
            exchange.close();
        });

        var gateway = new OpenAiCompatibleClinicalAiSpeechGateway(settings("server-secret"), jsonCodec);
        String result = gateway.transcribe(new SpeechRequest(
                "audio/webm", "clinical-dictation.webm", "audio-payload".getBytes(StandardCharsets.UTF_8), "zh"));

        assertEquals("患者咳嗽三天。", result);
        assertEquals("Bearer server-secret", authorization.get());
        assertTrue(contentType.get().startsWith("multipart/form-data; boundary=rhn-"));
        String body = new String(requestBody.get(), StandardCharsets.UTF_8);
        assertTrue(body.contains("name=\"model\"\r\n\r\ntest-transcribe"));
        assertTrue(body.contains("name=\"language\"\r\n\r\nzh"));
        assertTrue(body.contains("name=\"prompt\""));
        assertTrue(body.contains("name=\"file\"; filename=\"clinical-dictation.webm\""));
        assertTrue(body.contains("Content-Type: audio/webm"));
        assertTrue(body.contains("audio-payload"));
        assertTrue(body.endsWith("--\r\n"));
    }

    @Test
    void rejectsNonSuccessfulProviderResponseWithoutLeakingBody() throws Exception {
        startServer(exchange -> {
            byte[] response = "provider-secret-error".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(429, response.length);
            exchange.getResponseBody().write(response);
            exchange.close();
        });

        ClinicalAiModelException error = assertThrows(ClinicalAiModelException.class,
                () -> new OpenAiCompatibleClinicalAiSpeechGateway(settings(null), jsonCodec).transcribe(
                        new SpeechRequest("audio/wav", "clinical-dictation.wav", new byte[]{1}, "zh")));

        assertEquals("语音转写服务返回非成功状态：429", error.getMessage());
        assertFalse(error.getMessage().contains("provider-secret-error"));
    }

    private ClinicalAssistantSettings settings(String apiKey) {
        return new ClinicalAssistantSettings("MODEL", "test-provider", "test-model", Duration.ofMinutes(30),
                "http://127.0.0.1:9/v1/chat/completions", apiKey, Duration.ofSeconds(5), 1200,
                "http://127.0.0.1:" + server.getAddress().getPort() + "/v1/audio/transcriptions",
                "test-transcribe", 20 * 1024 * 1024, "", "", 5);
    }

    private void startServer(com.sun.net.httpserver.HttpHandler handler) throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/v1/audio/transcriptions", handler);
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
