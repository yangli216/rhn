package com.rhn.ai.infrastructure;

import com.rhn.ai.api.ClinicalAssistantContracts.Draft;
import com.rhn.ai.api.ClinicalAssistantContracts.RecordDraft;
import com.rhn.ai.api.ClinicalAssistantContracts.SuggestionContent;
import com.rhn.ai.application.ClinicalAiModelException;
import com.rhn.ai.application.ClinicalAiModelGateway.ModelRequest;
import com.rhn.ai.application.ClinicalAiMetrics;
import com.rhn.ai.application.ClinicalAssistantSettings;
import com.rhn.diagnostics.api.DiagnosticReportResponse;
import com.rhn.healthcore.api.ResidentDirectory;
import com.rhn.outpatient.api.OutpatientPlanTemplateDirectory;
import com.rhn.outpatient.api.OutpatientClinicalHistoryDirectory;
import com.rhn.shared.json.JsonCodec;
import com.sun.net.httpserver.HttpServer;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.math.BigDecimal;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class OpenAiCompatibleClinicalAiModelGatewayTest {
    private HttpServer server;
    private final JsonCodec jsonCodec = new TestJsonCodec();

    @AfterEach
    void stopServer() {
        if (server != null) server.stop(0);
    }

    @Test
    void sendsMinimumPatientContextAndParsesStructuredResponse() throws Exception {
        AtomicReference<String> requestBody = new AtomicReference<>();
        AtomicReference<String> authorization = new AtomicReference<>();
        SuggestionContent modelContent = new SuggestionContent("结构化分析完成",
                new RecordDraft(null, "现病史草稿", null, null, null), List.of(), List.of(),
                List.of("补问持续时间"), List.of(), List.of(), "模型原始声明");
        startServer(exchange -> {
            requestBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            authorization.set(exchange.getRequestHeaders().getFirst("Authorization"));
            String response = jsonCodec.write(Map.of(
                    "choices", List.of(Map.of("message", Map.of(
                            "content", "```json\n" + jsonCodec.write(modelContent) + "\n```"))),
                    "usage", Map.of("prompt_tokens", 120, "completion_tokens", 45, "total_tokens", 165)));
            byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });

        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        var gateway = new OpenAiCompatibleClinicalAiModelGateway(settings("secret-key"), jsonCodec,
                java.net.http.HttpClient.newHttpClient(), new ClinicalAiMetrics(registry));
        SuggestionContent result = gateway.analyze(request());

        assertEquals("结构化分析完成", result.summary());
        assertEquals("现病史草稿", result.recordDraft().presentIllness());
        assertEquals("Bearer secret-key", authorization.get());
        assertTrue(requestBody.get().contains("RHN-CLINICAL-ASSISTANT-V6"));
        assertTrue(requestBody.get().contains("语音转写内容"));
        assertTrue(requestBody.get().contains("FEMALE"));
        assertTrue(requestBody.get().contains("血常规"));
        assertTrue(requestBody.get().contains("白细胞计数"));
        assertTrue(requestBody.get().contains("12.5"));
        assertTrue(requestBody.get().contains("阿莫西林"));
        assertTrue(requestBody.get().contains("胸部CT"));
        assertTrue(requestBody.get().contains("二甲双胍"));
        assertFalse(requestBody.get().contains("测试患者"), "姓名不应发送给模型");
        assertFalse(requestBody.get().contains("13800000000"), "电话不应发送给模型");
        assertFalse(requestBody.get().contains("报告医生"), "报告作者不应发送给模型");
        assertFalse(requestBody.get().contains("external-report-1"), "外部报告标识不应发送给模型");
        assertFalse(requestBody.get().contains("digest-secret"), "报告摘要不应发送给模型");
        assertEquals(165, registry.get("rhn.ai.clinical.tokens").tag("kind", "total").summary().totalAmount());
    }

    @Test
    void rejectsNonSuccessfulProviderResponseWithoutLeakingBody() throws Exception {
        startServer(exchange -> {
            byte[] bytes = "provider-secret-error".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(503, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });

        ClinicalAiModelException error = assertThrows(ClinicalAiModelException.class,
                () -> new OpenAiCompatibleClinicalAiModelGateway(settings(null), jsonCodec).analyze(request()));
        assertEquals("模型服务返回非成功状态：503", error.getMessage());
        assertFalse(error.getMessage().contains("provider-secret-error"));
    }

    private ClinicalAssistantSettings settings(String apiKey) {
        return new ClinicalAssistantSettings("MODEL", "test-provider", "test-model", Duration.ofMinutes(30),
                "http://127.0.0.1:" + server.getAddress().getPort() + "/v1/chat/completions", apiKey,
                Duration.ofSeconds(5), 1200, "", "gpt-transcribe", 20 * 1024 * 1024,
                "", "", 5);
    }

    private ModelRequest request() {
        var plan = new OutpatientPlanTemplateDirectory.PlanTemplateSnapshot(60L, 0, "呼吸道方案", "待核对", 3,
                List.of(), List.of(new OutpatientPlanTemplateDirectory.MedicationSnapshot(
                601L, 61L, 62L, null, "WESTERN", "AMOX", "阿莫西林", "0.25g", null,
                new BigDecimal("0.5"), "g", "PO", "BID", new BigDecimal("5"), "DAY",
                new BigDecimal("10"), "片", "饭后服用", false, "SALE", true, "感染待排")),
                List.of(new OutpatientPlanTemplateDirectory.ServiceSnapshot(
                        63L, "CT-CHEST", "胸部CT", "EXAMINATION", BigDecimal.ONE, "次",
                        "肺部病变待排", "胸部影像学检查")));
        var history = new OutpatientClinicalHistoryDirectory.EncounterHistorySnapshot(
                70L, 1, Instant.parse("2026-08-08T08:00:00Z"), List.of(),
                List.of(new OutpatientClinicalHistoryDirectory.MedicationFact(
                        71L, 1, "ACTIVE", "METFORMIN", "二甲双胍", new BigDecimal("0.5"),
                        "g", "PO", "BID", new BigDecimal("30"), "DAY", new BigDecimal("60"),
                        "片", Instant.parse("2026-08-08T08:10:00Z"))), List.of());
        return new ModelRequest("RHN-CLINICAL-ASSISTANT-V6", "补全病历", "语音转写内容",
                new Draft("头晕", "", "高血压病史", "", "", 160, 100, null, 80, 18, 98, List.of()),
                new ResidentDirectory.ResidentSnapshot(1L, "HRN001", "测试患者", "FEMALE",
                        LocalDate.of(1988, 8, 8), "13800000000", false),
                List.of(), List.of(plan), List.of(report()), List.of(history), null);
    }

    private DiagnosticReportResponse report() {
        return new DiagnosticReportResponse(10L, 1L, 20L, 30L, "LIS", "external-report-1", 1,
                null, "LABORATORY", "FINAL", "CBC", "血常规", Instant.parse("2026-09-08T08:00:00Z"),
                Instant.parse("2026-09-08T08:01:00Z"), "白细胞计数升高", "doctor-code", "报告医生",
                "SHA-256", "digest-secret", 40L, List.of(new DiagnosticReportResponse.ObservationView(
                50L, 1, "urn:loinc", "2.78", "6690-2", "白细胞计数", "FINAL", "NUMBER",
                Instant.parse("2026-09-08T07:58:00Z"), null, new BigDecimal("12.5"), null, null,
                null, "10^9/L", new BigDecimal("3.5"), new BigDecimal("9.5"), "H", "lab", "检验人员")));
    }

    private void startServer(com.sun.net.httpserver.HttpHandler handler) throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/v1/chat/completions", handler);
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
