package com.rhn.ai.infrastructure;

import com.rhn.ai.application.ClinicalAiModelException;
import com.rhn.ai.application.ClinicalAiSpeechGateway.SpeechRequest;
import com.rhn.ai.application.ClinicalAssistantSettings;
import com.rhn.shared.json.JsonCodec;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class OpenAiCompatibleClinicalAiSpeechGatewayTest {
    private HttpServer server;
    private final JsonCodec jsonCodec = new TestJsonCodec();

    @AfterEach
    void stopServer() {
        if (server != null) server.stop(0);
    }

    @ParameterizedTest
    @ValueSource(strings = {"test-transcribe", "qwen3-asr-flash", "paraformer-v2", "sensevoice-v1"})
    void sendsAuthorizedMultipartRequestAndParsesTranscript(String model) throws Exception {
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

        var gateway = new OpenAiCompatibleClinicalAiSpeechGateway(settings("server-secret", model), jsonCodec);
        String result = gateway.transcribe(new SpeechRequest(
                "audio/webm", "clinical-dictation.webm", "audio-payload".getBytes(StandardCharsets.UTF_8), "zh"));

        assertEquals("患者咳嗽三天。", result);
        assertEquals("Bearer server-secret", authorization.get());
        assertTrue(contentType.get().startsWith("multipart/form-data; boundary=rhn-"));
        String body = new String(requestBody.get(), StandardCharsets.UTF_8);
        assertTrue(body.contains("name=\"model\"\r\n\r\n" + model + "\r\n"));
        assertTrue(body.contains("name=\"language\"\r\n\r\nzh"));
        assertTrue(body.contains("name=\"prompt\""));
        assertTrue(body.contains("name=\"file\"; filename=\"clinical-dictation.webm\""));
        assertTrue(body.contains("Content-Type: audio/webm"));
        assertTrue(body.contains("audio-payload"));
        assertTrue(body.endsWith("--\r\n"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"/services/audio/asr/transcription", "/private-asr/submit", "/api/v1/private-asr/submit"})
    void sendsDashScopeAsrRequestAndPollsTranscript(String submitPath) throws Exception {
        AtomicReference<String> asyncHeader = new AtomicReference<>();
        AtomicReference<String> authorization = new AtomicReference<>();
        AtomicReference<String> submitBody = new AtomicReference<>();

        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        int port = server.getAddress().getPort();

        server.createContext(submitPath, exchange -> {
            asyncHeader.set(exchange.getRequestHeaders().getFirst("X-DashScope-Async"));
            authorization.set(exchange.getRequestHeaders().getFirst("Authorization"));
            submitBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] response = "{\"output\":{\"task_id\":\"task-999\",\"task_status\":\"PENDING\"}}".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, response.length);
            exchange.getResponseBody().write(response);
            exchange.close();
        });

        server.createContext((submitPath.startsWith("/api/v1/") ? "/api/v1" : "") + "/tasks/task-999", exchange -> {
            byte[] response = ("{\"output\":{\"task_id\":\"task-999\",\"task_status\":\"SUCCEEDED\","
                    + "\"results\":[{\"transcription_url\":\"http://127.0.0.1:" + port + "/results/trans-999\"}]}}")
                    .getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, response.length);
            exchange.getResponseBody().write(response);
            exchange.close();
        });

        server.createContext("/results/trans-999", exchange -> {
            byte[] response = "{\"transcripts\":[{\"text\":\"患者发热伴咽痛两日。\"}]}".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, response.length);
            exchange.getResponseBody().write(response);
            exchange.close();
        });
        server.start();

        ClinicalAssistantSettings settings = new ClinicalAssistantSettings("MODEL", "test-provider", "test-model", Duration.ofMinutes(30),
                "http://127.0.0.1:9/v1/chat/completions", "dashscope-secret", Duration.ofSeconds(5), 1200,
                "http://127.0.0.1:" + port + submitPath,
                "qwen3-asr-flash", 20 * 1024 * 1024, "", "", 5);

        var gateway = new OpenAiCompatibleClinicalAiSpeechGateway(settings, jsonCodec);
        String result = gateway.transcribe(new SpeechRequest(
                "audio/wav", "test.wav", new byte[]{1, 2, 3}, "zh"));

        assertEquals("患者发热伴咽痛两日。", result);
        assertEquals("enable", asyncHeader.get());
        assertEquals("Bearer dashscope-secret", authorization.get());
        assertTrue(submitBody.get().contains("qwen3-asr-flash-filetrans"));
        assertTrue(submitBody.get().contains("data:audio/wav;base64,"));
    }

    @ParameterizedTest
    @CsvSource({
            "qwen3-asr-flash,https://speech.example:9443/private-asr?version=2",
            "paraformer-v2,https://speech.example/private-asr",
            "sensevoice-v1,https://speech.example/private-asr",
            "qwen3-asr-flash,https://dashscope-intl.aliyuncs.com/api/v1/services/audio/asr/transcription",
            "qwen3-asr-flash,https://dashscope.aliyuncs.com/misconfigured-path"
    })
    void honorsRuntimeEndpointWithoutFallingBackToPublicService(String model, String endpoint) throws Exception {
        var defaults = new ClinicalAssistantSettings("MODEL", "test-provider", "test-model", Duration.ofMinutes(30),
                "https://model.example/chat", "default-key", Duration.ofSeconds(5), 1200,
                "https://default.example/asr", "default-model", 1024, "", "", 5);
        var runtime = new ClinicalAssistantSettings("MODEL", "test-provider", "test-model", Duration.ofMinutes(30),
                "https://model.example/chat", "runtime-key", Duration.ofSeconds(5), 1200,
                endpoint, model, 1024, "", "", 5);
        var client = mock(HttpClient.class);
        when(client.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
                .thenThrow(new java.net.ConnectException("synthetic connection failure"));
        var gateway = new OpenAiCompatibleClinicalAiSpeechGateway(defaults, jsonCodec, client);

        assertThrows(ClinicalAiModelException.class, () -> gateway.transcribe(
                new SpeechRequest("audio/wav", "test.wav", new byte[]{1, 2, 3}, "zh"), runtime));
        var sent = ArgumentCaptor.forClass(HttpRequest.class);
        verify(client).send(sent.capture(), any(HttpResponse.BodyHandler.class));
        assertEquals(URI.create(endpoint), sent.getValue().uri());
        assertEquals("Bearer runtime-key", sent.getValue().headers().firstValue("Authorization").orElseThrow());
        assertEquals("enable", sent.getValue().headers().firstValue("X-DashScope-Async").orElseThrow());
        verifyNoMoreInteractions(client);
    }

    @ParameterizedTest
    @ValueSource(ints = {5, 90})
    void sharesRuntimeTimeoutAcrossSubmissionRepeatedPollingAndDownload(int seconds) throws Exception {
        var clock = new AtomicLong();
        var calls = new AtomicInteger();
        var client = mock(HttpClient.class);
        when(client.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class))).thenAnswer(call -> {
            clock.addAndGet(Duration.ofSeconds(1).toNanos());
            return response(switch (calls.getAndIncrement()) {
                case 0 -> "{\"output\":{\"task_id\":\"task-budget\"}}";
                case 1 -> "{\"output\":{\"task_status\":\"RUNNING\"}}";
                case 2 -> "{\"output\":{\"task_status\":\"SUCCEEDED\",\"result\":{\"transcription_url\":\"https://speech.example/result\"}}}";
                default -> "{\"transcripts\":[{\"text\":\"患者咳嗽三天。\"}]}";
            });
        });
        var gateway = new OpenAiCompatibleClinicalAiSpeechGateway(
                dashScopeSettings(Duration.ofSeconds(45)), jsonCodec, client, clock::get);

        String result = gateway.transcribe(new SpeechRequest("audio/wav", "test.wav", new byte[]{1}, "zh"),
                dashScopeSettings(Duration.ofSeconds(seconds)));

        assertEquals("患者咳嗽三天。", result);
        var sent = ArgumentCaptor.forClass(HttpRequest.class);
        verify(client, times(4)).send(sent.capture(), any(HttpResponse.BodyHandler.class));
        for (int index = 0; index < 4; index++) {
            assertEquals(Duration.ofSeconds(seconds - index), sent.getAllValues().get(index).timeout().orElseThrow());
        }
        assertEquals("POST", sent.getAllValues().getFirst().method());
        assertEquals("/tasks/task-budget", sent.getAllValues().get(1).uri().getPath());
        assertEquals("/tasks/task-budget", sent.getAllValues().get(2).uri().getPath());
        assertEquals("/result", sent.getAllValues().getLast().uri().getPath());
    }

    @ParameterizedTest
    @ValueSource(ints = {1, 2, 3})
    void stopsAtExhaustedBudgetWithoutStartingNextStageOrReturningLateText(int exhaustedAfter) throws Exception {
        var clock = new AtomicLong();
        var calls = new AtomicInteger();
        var client = mock(HttpClient.class);
        when(client.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class))).thenAnswer(call -> {
            int stage = calls.incrementAndGet();
            if (stage == exhaustedAfter) clock.set(Duration.ofSeconds(5).toNanos());
            return response(switch (stage) {
                case 1 -> "{\"output\":{\"task_id\":\"task-budget\"}}";
                case 2 -> "{\"output\":{\"task_status\":\"SUCCEEDED\",\"result\":{\"transcription_url\":\"https://speech.example/result\"}}}";
                default -> "{\"transcripts\":[{\"text\":\"迟到的转写结果\"}]}";
            });
        });
        var gateway = new OpenAiCompatibleClinicalAiSpeechGateway(
                dashScopeSettings(Duration.ofSeconds(45)), jsonCodec, client, clock::get);

        var error = assertThrows(ClinicalAiModelException.class, () -> gateway.transcribe(
                new SpeechRequest("audio/wav", "test.wav", new byte[]{1}, "zh"), dashScopeSettings(Duration.ofSeconds(5))));

        assertTrue(error.getMessage().contains("转写超时 (5 秒)"));
        verify(client, times(exhaustedAfter)).send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class));
        verifyNoMoreInteractions(client);
    }

    private ClinicalAssistantSettings dashScopeSettings(Duration timeout) {
        return new ClinicalAssistantSettings("MODEL", "test-provider", "test-model", Duration.ofMinutes(30),
                "https://model.example/chat", "test-key", timeout, 1200,
                "https://speech.example/services/audio/asr/transcription", "qwen3-asr-flash", 1024, "", "", 5);
    }

    @SuppressWarnings("unchecked")
    private HttpResponse<String> response(String body) {
        HttpResponse<String> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(200);
        when(response.body()).thenReturn(body);
        return response;
    }

    private ClinicalAssistantSettings settings(String apiKey, String model) {
        return new ClinicalAssistantSettings("MODEL", "test-provider", "test-model", Duration.ofMinutes(30),
                "http://127.0.0.1:9/v1/chat/completions", apiKey, Duration.ofSeconds(5), 1200,
                "http://127.0.0.1:" + server.getAddress().getPort() + "/v1/audio/transcriptions",
                model, 20 * 1024 * 1024, "", "", 5);
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
