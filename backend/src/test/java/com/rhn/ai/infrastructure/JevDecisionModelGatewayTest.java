package com.rhn.ai.infrastructure;

import com.rhn.ai.application.DecisionModelGateway;
import com.rhn.ai.application.DecisionModelSettings;
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

class JevDecisionModelGatewayTest {
    HttpServer server;
    JevDecisionModelGateway gateway;
    DecisionModelSettings settings;
    String response;
    int status = 200;
    final AtomicReference<String> body = new AtomicReference<>();
    final AtomicReference<String> auth = new AtomicReference<>();
    DecisionModelGateway.Request request;
    @BeforeEach void setup() throws Exception {
        var mapper = JsonMapper.builder().build();
        var json = mock(JsonCodec.class);
        when(json.write(any())).thenAnswer(call -> mapper.writeValueAsString(call.getArgument(0)));
        when(json.readStrictTree(anyString())).thenAnswer(call -> mapper.readTree((String) call.getArgument(0)));
        gateway = new JevDecisionModelGateway(json, mock(ClinicalAiMetrics.class));
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
}
