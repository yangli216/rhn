package com.rhn.ai.infrastructure;

import com.rhn.ai.application.DecisionModelGateway;
import com.rhn.ai.application.DecisionModelSettings;
import com.rhn.ai.application.DecisionProvider;
import com.rhn.ai.application.ClinicalAiMetrics;
import com.rhn.shared.json.JsonCodec;
import com.rhn.shared.api.BusinessException;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.*;
import tools.jackson.databind.json.JsonMapper;
import java.net.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.junit.jupiter.api.Assertions.*;

class SystemOneDecisionModelGatewayTest {
    HttpServer server;
    SystemOneDecisionModelGateway gateway;
    DecisionModelSettings settings;
    String response;
    ClinicalAiMetrics metrics;
    int status = 200;
    final AtomicReference<String> body = new AtomicReference<>();
    final AtomicReference<String> auth = new AtomicReference<>();
    DecisionModelGateway.Request request;
    @BeforeEach void setup() throws Exception {
        var mapper = JsonMapper.builder().build();
        var json = mock(JsonCodec.class);
        when(json.write(any())).thenAnswer(call -> mapper.writeValueAsString(call.getArgument(0)));
        when(json.readStrictTree(anyString())).thenAnswer(call -> mapper.readTree((String) call.getArgument(0)));
        metrics = mock(ClinicalAiMetrics.class);
        gateway = new SystemOneDecisionModelGateway(json, metrics);
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/v1/systemone", exchange -> {
            body.set(new String(exchange.getRequestBody().readAllBytes(), java.nio.charset.StandardCharsets.UTF_8));
            auth.set(exchange.getRequestHeaders().getFirst("Authorization"));
            byte[] bytes = response.getBytes(java.nio.charset.StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(status, bytes.length);
            try (var output = exchange.getResponseBody()) { output.write(bytes); }
        });
        server.start();
        settings = new DecisionModelSettings(DecisionModelSettings.Mode.ASSIST,
            URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/v1/systemone"), "jev-1.13.0", "fake-jev-key", Duration.ofSeconds(2), 0.9);
        request = new DecisionModelGateway.Request("V1", mapper.readTree("{\"intent\":\"CBC\"}"),
            List.of(new DecisionModelGateway.ChoiceQuestion("q", "Select equivalent", Map.of("LAB|101", "CBC", "NONE", "No match"))));
        response = "{\"model\":\"jev-1.13.0\",\"answers\":{\"q\":{\"type\":\"choice\",\"choice\":\"LAB|101\",\"probabilities\":{\"LAB|101\":0.95,\"NONE\":0.05},\"confidence\":0.92}},\"usage\":{\"input_tokens\":100}}";
    }
    @AfterEach void stop() { if (server != null) server.stop(0); }
    @Test void sendsNativeTypedApiAndPreservesRawDistribution() {
        var result = gateway.decide(request, settings);
        assertEquals("Bearer fake-jev-key", auth.get());
        assertTrue(body.get().contains("\"type\":\"choice\""));
        assertFalse(body.get().contains("messages"));
        assertEquals(0.95, result.answers().get("q").probabilities().get("LAB|101"));
        assertEquals(0.92, result.answers().get("q").confidence());
        assertNotNull(result.traceId());
    }
    @Test void rejectsInventedCandidateMissingFieldsAndInvalidDistribution() {
        String valid = response;
        response = valid.replace("\"choice\":\"LAB|101\"", "\"choice\":\"LAB|999\"");
        assertThrows(BusinessException.class, () -> gateway.decide(request, settings));
        response = valid.replace("0.95", "0.5");
        assertThrows(BusinessException.class, () -> gateway.decide(request, settings));
        response = valid.replace(",\"confidence\":0.92", "");
        assertThrows(BusinessException.class, () -> gateway.decide(request, settings));
    }
    @Test void providerErrorDoesNotExposeResponseOrSecret() {
        status = 401; response = "fake-jev-key secret provider detail";
        var error = assertThrows(BusinessException.class, () -> gateway.decide(request, settings));
        assertFalse(error.getMessage().contains("fake-jev-key"));
        assertTrue(error.getMessage().contains("401"));
    }

    private void lingdt() {
        settings = new DecisionModelSettings(settings.mode(), settings.endpoint(), "lingdt-decision-1.0",
                "lingdt-key", settings.timeout(), settings.minConfidence(), DecisionProvider.LINGDT);
        response = response.replace("jev-1.13.0", "lingdt-decision-1.0");
    }

    @Test void lingdtUsesNativeChoiceProtocolAndSeparateProviderMetrics() {
        lingdt();
        response = response.substring(0, response.length() - 1) + ",\"errorCode\":0,\"layers\":[]}";
        var result = gateway.decide(request, settings);
        assertEquals("Bearer lingdt-key", auth.get());
        assertTrue(body.get().contains("\"model\":\"lingdt-decision-1.0\""));
        assertEquals("LAB|101", result.answers().get("q").choice());
        assertEquals(0.95, result.answers().get("q").probabilities().get("LAB|101"));
        verify(metrics).recordProviderTokens("lingdt", "lingdt-decision-1.0", "input", 100);
        verify(metrics).recordProviderRequest(eq("lingdt"), eq("lingdt-decision-1.0"), eq("V1"),
                eq("CHOICE"), eq("COMPLETED"), anyLong());
    }

    @Test void lingdtRejectsBusinessErrorEvenWithHttpSuccessAndDoesNotExposeProviderBody() {
        lingdt();
        response = "{\"errorCode\":12,\"message\":\"lingdt-key private detail\"}";
        var error = assertThrows(BusinessException.class, () -> gateway.decide(request, settings));
        assertEquals("DECISION_PROVIDER_REJECTED", error.code());
        assertFalse(error.getMessage().contains("lingdt-key"));
    }

    @Test void lingdtRejectsTooManyQuestionsAndOversizedUtf8InputBeforeSending() {
        lingdt();
        var questions = java.util.stream.IntStream.range(0, 33).mapToObj(i ->
                new DecisionModelGateway.ChoiceQuestion("q" + i, "Select", Map.of("A", "a", "NONE", "none"))).toList();
        assertEquals("DECISION_QUESTION_LIMIT", assertThrows(BusinessException.class,
                () -> gateway.decide(new DecisionModelGateway.Request("V1", request.state(), questions), settings)).code());
        var mapper = JsonMapper.builder().build();
        var state = mapper.createObjectNode().put("text", "甲".repeat(6000));
        assertEquals("DECISION_INPUT_TOO_LARGE", assertThrows(BusinessException.class,
                () -> gateway.decide(new DecisionModelGateway.Request("V1", state, request.questions()), settings)).code());
        assertNull(body.get());
    }
}
