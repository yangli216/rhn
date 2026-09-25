package com.rhn.ai.infrastructure;

import com.rhn.ai.api.ClinicalAssistantContracts.Draft;
import com.rhn.ai.api.ClinicalAssistantContracts.RecordDraft;
import com.rhn.ai.api.ClinicalAssistantContracts.SuggestionContent;
import com.rhn.ai.application.ClinicalAiModelException;
import com.rhn.ai.application.ClinicalAiModelGateway.ModelRequest;
import com.rhn.ai.application.ClinicalAiModelGateway.PlanInput;
import com.rhn.ai.application.ClinicalAiModelGateway.PlanIntent;
import com.rhn.ai.application.ClinicalAiModelGateway.PlanIntentItem;
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
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
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
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.ArgumentMatchers.any;

class OpenAiCompatibleClinicalAiModelGatewayTest {
    private HttpServer server;
    private final JsonCodec jsonCodec = new TestJsonCodec();

    @AfterEach
    void stopServer() {
        if (server != null) server.stop(0);
    }

    @Test
    void planCompilationCallsConfiguredModelAndParsesOnlyItsStructuredAnswer() throws Exception {
        AtomicReference<String> requestBody = new AtomicReference<>();
        startServer(exchange -> {
            requestBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            PlanIntent answer = new PlanIntent("随访方案", "待核对",
                    "复诊与转诊：一周后复诊。", List.of(
                    new PlanIntentItem("FOLLOW_UP", "一周后复诊", "一周后复诊", "EXPLICIT", null)), null);
            String response = jsonCodec.write(Map.of("choices", List.of(Map.of("message", Map.of(
                    "content", jsonCodec.write(answer))))));
            byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });

        PlanIntent result = new OpenAiCompatibleClinicalAiModelGateway(settings("secret-key"), jsonCodec)
                .compilePlan(new PlanInput("RHN-PLAN-COMPILER-V1", "INPUT", "一周后复诊"), settings("secret-key"));

        assertEquals("一周后复诊", result.items().getFirst().sourceQuote());
        assertTrue(result.narrative().contains("复诊与转诊"));
        JsonNode request = jsonCodec.readTree(requestBody.get());
        assertEquals("test-model", request.get("model").asString());
        assertTrue(request.get("messages").get(0).get("content").asString().contains("门诊临床诊疗方案编译器"));
        assertTrue(request.get("messages").get(0).get("content").asString().contains("医生可直接审核和修订的完整门诊文字方案"));
        assertTrue(request.get("messages").get(1).get("content").asString().contains("一周后复诊"));
    }

    @Test
    void planRevisionCarriesTheCurrentDraftAndAllowsStandardizedDiagnosisNames() throws Exception {
        AtomicReference<String> requestBody = new AtomicReference<>();
        var calls = new java.util.concurrent.atomic.AtomicInteger();
        startServer(exchange -> {
            calls.incrementAndGet();
            requestBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            PlanIntent answer = new PlanIntent("成人上感方案", "已修订", "诊断与评估：急性上呼吸道感染。",
                    List.of(new PlanIntentItem("DIAGNOSIS", "急性上呼吸道感染，未特指",
                            "成人风寒感冒推荐方案", "EXPLICIT", "核对门诊表现")), null);
            String response = jsonCodec.write(Map.of("choices", List.of(Map.of("message", Map.of(
                    "content", jsonCodec.write(answer))))));
            byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });

        PlanIntent result = new OpenAiCompatibleClinicalAiModelGateway(settings(null), jsonCodec)
                .compilePlan(new PlanInput("RHN-PLAN-COMPILER-V2", "INPUT", "成人风寒感冒推荐方案", List.of(),
                        "上一版包含血常规", "删除血常规并使用标准诊断名称"), settings(null));

        assertEquals(1, calls.get(), "标准诊断名称不必逐字出现在原始口述中");
        assertEquals("急性上呼吸道感染，未特指", result.items().getFirst().name());
        JsonNode sent = jsonCodec.readTree(requestBody.get());
        String context = sent.get("messages").get(1).get("content").asString();
        assertTrue(context.contains("上一版包含血常规"));
        assertTrue(context.contains("删除血常规并使用标准诊断名称"));
        assertTrue(sent.get("messages").get(0).get("content").asString().contains("规范、可用于 ICD-10"));
    }

    @Test
    void planCompilationRechecksAShortInputWhenTheFirstModelAnswerIsEmpty() throws Exception {
        var calls = new java.util.concurrent.atomic.AtomicInteger();
        startServer(exchange -> {
            int call = calls.incrementAndGet();
            PlanIntent answer = call == 1
                    ? new PlanIntent("成人感冒常用方案", "", List.of())
                    : new PlanIntent("成人感冒常用方案", "待核对", List.of(
                    new PlanIntentItem("CONDITION", "成人感冒", "成人感冒", "EXPLICIT", null)));
            String response = jsonCodec.write(Map.of("choices", List.of(Map.of("message", Map.of(
                    "content", jsonCodec.write(answer))))));
            byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });

        PlanIntent result = new OpenAiCompatibleClinicalAiModelGateway(settings(null), jsonCodec)
                .compilePlan(new PlanInput("RHN-PLAN-COMPILER-V1", "INPUT", "成人感冒常用方案"), settings(null));

        assertEquals(2, calls.get());
        assertEquals("成人感冒", result.items().getFirst().name());
    }

    @Test
    void planCompilationRechecksInvalidEvidenceAndDowngradesUnsupportedItems() throws Exception {
        var calls = new java.util.concurrent.atomic.AtomicInteger();
        AtomicReference<String> secondRequest = new AtomicReference<>();
        startServer(exchange -> {
            int call = calls.incrementAndGet();
            if (call == 2) {
                secondRequest.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            } else {
                exchange.getRequestBody().readAllBytes();
            }
            PlanIntent answer = call == 1
                    ? new PlanIntent("感冒方案", "待核对", "治疗方案：可考虑对乙酰氨基酚。", List.of(
                    new PlanIntentItem("MEDICATION", "对乙酰氨基酚片", "可考虑对乙酰氨基酚", "EXPLICIT", null)), null)
                    : new PlanIntent("感冒方案", "待核对", "治疗方案：可考虑对乙酰氨基酚。", List.of(
                    new PlanIntentItem("MEDICATION", "对乙酰氨基酚片", null, "SUGGESTED", null)), null);
            String response = jsonCodec.write(Map.of("choices", List.of(Map.of("message", Map.of(
                    "content", jsonCodec.write(answer))))));
            byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });

        PlanIntent result = new OpenAiCompatibleClinicalAiModelGateway(settings(null), jsonCodec)
                .compilePlan(new PlanInput("RHN-PLAN-COMPILER-V2", "INPUT", "成人感冒常用方案"), settings(null));

        assertEquals(2, calls.get());
        assertEquals("SUGGESTED", result.items().getFirst().origin());
        assertTrue(jsonCodec.readTree(secondRequest.get()).get("messages").get(2).get("content").asString()
                .contains("无法逐字核对的原文依据"));
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
        assertTrue(requestBody.get().contains("RHN-CLINICAL-ASSISTANT-V8"));
        assertTrue(requestBody.get().contains("语音转写内容"));
        var sent = jsonCodec.readTree(requestBody.get());
        var context = jsonCodec.readTree(sent.get("messages").get(1).get("content").asString());
        assertEquals("REPORT_FOLLOW_UP", context.get("receptionScene").asString());
        assertEquals(10, context.get("receptionSceneContext").get("selectedReportIds").get(0).asInt());
        assertEquals(10, context.get("diagnosticReports").get(0).get("reportId").asInt());
        assertEquals("1988-08-08", context.get("patient").get("birthDate").asText());
        assertEquals(java.time.LocalDate.now(java.time.ZoneId.of("Asia/Shanghai")).toString(),
                context.get("patient").get("ageCalculationDate").asText());
        assertEquals("VALID_ON_CURRENT_DATE", context.get("patient").get("birthDateStatus").asText());
        assertEquals(38, context.get("patient").get("ageYears").asInt());
        assertEquals("38岁", context.get("patient").get("ageText").asText());
        assertEquals(java.time.LocalDate.now(java.time.ZoneId.of("Asia/Shanghai")).toString(),
                context.get("temporalContext").get("currentDate").asText());
        assertTrue(sent.get("messages").get(0).get("content").asString().contains("不得默认既往体健"));
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
        assertEquals(ClinicalAiModelException.Reason.PROVIDER_REJECTED, error.reason());
        assertEquals(503, error.providerStatus());
    }

    @ParameterizedTest
    @CsvSource({"400,PROVIDER_REJECTED", "401,AUTHENTICATION", "403,AUTHENTICATION", "429,RATE_LIMIT"})
    void classifiesProviderErrorsWithoutLeakingResponse(int status, ClinicalAiModelException.Reason reason) throws Exception {
        stubResponse(status, "provider-secret-error");
        ClinicalAiModelException error = assertThrows(ClinicalAiModelException.class,
                () -> new OpenAiCompatibleClinicalAiModelGateway(settings(null), jsonCodec).analyze(request()));
        assertEquals(reason, error.reason());
        assertEquals(status, error.providerStatus());
        assertFalse(error.userMessage().contains("provider-secret-error"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"{", "null", "{\"diagnosisCandidates\":\"wrong-type\"}"})
    void rejectsInvalidStructuredContent(String content) throws Exception {
        stubResponse(200, jsonCodec.write(Map.of("choices", List.of(Map.of("message", Map.of("content", content))))));
        ClinicalAiModelException error = assertThrows(ClinicalAiModelException.class,
                () -> new OpenAiCompatibleClinicalAiModelGateway(settings(null), jsonCodec).analyze(request()));
        assertEquals(ClinicalAiModelException.Reason.INVALID_RESPONSE, error.reason());
    }

    @Test
    void rejectsTruncatedOutputEvenWhenPartialContentIsValidJson() throws Exception {
        stubResponse(200, """
                {"choices":[{"finish_reason":"length","message":{"content":"{}"}}]}
                """);
        ClinicalAiModelException error = assertThrows(ClinicalAiModelException.class,
                () -> new OpenAiCompatibleClinicalAiModelGateway(settings(null), jsonCodec).analyze(request()));
        assertEquals(ClinicalAiModelException.Reason.OUTPUT_LIMIT, error.reason());
    }

    @Test
    void distinguishesTimeoutFromInvalidJson() throws Exception {
        stubResponse(200, "{}");
        var client = mock(java.net.http.HttpClient.class);
        when(client.send(any(java.net.http.HttpRequest.class), any(java.net.http.HttpResponse.BodyHandler.class)))
                .thenThrow(new java.net.http.HttpTimeoutException("sensitive provider detail"));
        ClinicalAiModelException error = assertThrows(ClinicalAiModelException.class,
                () -> new OpenAiCompatibleClinicalAiModelGateway(settings(null), jsonCodec, client).analyze(request()));
        assertEquals(ClinicalAiModelException.Reason.TIMEOUT, error.reason());
        assertFalse(error.userMessage().contains("sensitive provider detail"));
    }

    private void stubResponse(int status, String body) throws IOException {
        startServer(exchange -> {
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(status, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
    }

    @Test
    void streamsDraftBeforeProviderCompletesAndStillParsesFinalContent() throws Exception {
        var firstDelta = new java.util.concurrent.CountDownLatch(1);
        var body = new AtomicReference<String>();
        String json = "{\"summary\":\"合成测试摘要\",\"recordDraft\":{\"chiefComplaint\":\"测试主诉\"}}";
        startServer(exchange -> {
            body.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            exchange.getResponseHeaders().set("Content-Type", "text/event-stream");
            exchange.sendResponseHeaders(200, 0);
            var output = exchange.getResponseBody();
            output.write(deltaFrame(json.substring(0, 16)).getBytes(StandardCharsets.UTF_8));
            output.flush();
            try {
                if (!firstDelta.await(2, java.util.concurrent.TimeUnit.SECONDS)) throw new IOException("Delta was buffered");
            } catch (InterruptedException exception) { Thread.currentThread().interrupt(); }
            output.write((deltaFrame(json.substring(16))
                    + "data: {\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}]}\n\ndata: [DONE]\n\n")
                    .getBytes(StandardCharsets.UTF_8));
            exchange.close();
        });
        var chunks = new StringBuilder();
        var result = new OpenAiCompatibleClinicalAiModelGateway(settings(null), jsonCodec)
                .analyzeStreaming(request(), settings(null), delta -> { chunks.append(delta); firstDelta.countDown(); });
        assertEquals("合成测试摘要", result.summary());
        assertEquals(json, chunks.toString());
        assertTrue(jsonCodec.readTree(body.get()).path("stream").asBoolean());
        assertTrue(jsonCodec.readTree(body.get()).path("stream_options").path("include_usage").asBoolean());
    }

    @Test
    void streamsPlanDraftBeforeProviderCompletesAndParsesReviewItems() throws Exception {
        var firstDelta = new java.util.concurrent.CountDownLatch(1);
        var body = new AtomicReference<String>();
        String json = jsonCodec.write(new PlanIntent("成人上感方案", "待核对", "诊断与评估：上感待核对。",
                List.of(new PlanIntentItem("CONDITION", "成人上感", "成人上感", "EXPLICIT", "核对病程")), null));
        startServer(exchange -> {
            body.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            exchange.getResponseHeaders().set("Content-Type", "text/event-stream");
            exchange.sendResponseHeaders(200, 0);
            var output = exchange.getResponseBody();
            output.write(deltaFrame(json.substring(0, 18)).getBytes(StandardCharsets.UTF_8));
            output.flush();
            try {
                if (!firstDelta.await(2, java.util.concurrent.TimeUnit.SECONDS)) throw new IOException("Delta was buffered");
            } catch (InterruptedException exception) { Thread.currentThread().interrupt(); }
            output.write((deltaFrame(json.substring(18))
                    + "data: {\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}]}\n\ndata: [DONE]\n\n")
                    .getBytes(StandardCharsets.UTF_8));
            exchange.close();
        });
        var chunks = new StringBuilder();
        var result = new OpenAiCompatibleClinicalAiModelGateway(settings(null), jsonCodec)
                .compilePlanStreaming(new PlanInput("RHN-PLAN-COMPILER-V2", "INPUT", "成人上感"),
                        settings(null), delta -> { chunks.append(delta); firstDelta.countDown(); });
        assertEquals("成人上感方案", result.name());
        assertEquals("成人上感", result.items().getFirst().name());
        assertEquals(json, chunks.toString());
        assertTrue(jsonCodec.readTree(body.get()).path("stream").asBoolean());
    }

    @Test
    void doesNotAcceptAnInterruptedStreamAsACompleteSuggestion() throws Exception {
        stubResponse(200, deltaFrame("{\"summary\":\"半成品\"}"));
        var error = assertThrows(ClinicalAiModelException.class, () ->
                new OpenAiCompatibleClinicalAiModelGateway(settings(null), jsonCodec)
                        .analyzeStreaming(request(), settings(null), delta -> { }));
        assertEquals(ClinicalAiModelException.Reason.INVALID_RESPONSE, error.reason());
    }

    @Test
    void disablesThinkingForDashScopeQwenWithoutChangingOtherProviders() {
        var body = new LinkedHashMap<String, Object>();
        com.rhn.ai.application.ClinicalAiRequestOptions.applyNonThinkingDefault(body,
                java.net.URI.create("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"), "qwen3.8-27b");
        assertEquals(false, body.get("enable_thinking"));
        body.clear();
        com.rhn.ai.application.ClinicalAiRequestOptions.applyNonThinkingDefault(body,
                java.net.URI.create("https://api.example.com/v1/chat/completions"), "qwen3.8-27b");
        assertFalse(body.containsKey("enable_thinking"));
    }

    private String deltaFrame(String delta) {
        return "data: " + jsonCodec.write(Map.of("choices", List.of(Map.of("delta", Map.of("content", delta))))) + "\n\n";
    }

    @Test
    void enforcesDeadlineWhenProviderStallsAfterSendingHeaders() throws Exception {
        var release = new java.util.concurrent.CountDownLatch(1);
        startServer(exchange -> {
            exchange.getResponseHeaders().set("Content-Type", "text/event-stream");
            exchange.sendResponseHeaders(200, 0);
            exchange.getResponseBody().write(": waiting\n\n".getBytes(StandardCharsets.UTF_8));
            exchange.getResponseBody().flush();
            try { release.await(3, java.util.concurrent.TimeUnit.SECONDS); }
            catch (InterruptedException exception) { Thread.currentThread().interrupt(); }
            finally { exchange.close(); }
        });
        var active = new ClinicalAssistantSettings("MODEL", "test", "test-model", Duration.ofMinutes(30),
                settings(null).endpoint().toString(), null, Duration.ofMillis(300), 1200,
                "", "gpt-transcribe", 1024, "", "", 5);
        try {
            var error = org.junit.jupiter.api.Assertions.assertTimeoutPreemptively(Duration.ofSeconds(2), () ->
                    assertThrows(ClinicalAiModelException.class, () ->
                            new OpenAiCompatibleClinicalAiModelGateway(active, jsonCodec)
                                    .analyzeStreaming(request(), active, delta -> { })));
            assertEquals(ClinicalAiModelException.Reason.TIMEOUT, error.reason());
        } finally { release.countDown(); }
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
        return new ModelRequest("RHN-CLINICAL-ASSISTANT-V8", "补全病历", "语音转写内容",
                new Draft("头晕", "", "高血压病史", "", "", 160, 100, null, 80, 18, 98, List.of()),
                new ResidentDirectory.ResidentSnapshot(1L, "HRN001", "测试患者", "FEMALE",
                        LocalDate.of(1988, 8, 8), "13800000000", false),
                List.of(), List.of(plan), List.of(report()), List.of(history), null,
                com.rhn.ai.api.ClinicalAssistantContracts.ReceptionScene.REPORT_FOLLOW_UP,
                new com.rhn.ai.api.ClinicalAssistantContracts.ReceptionSceneContext(List.of("高血压"), List.of(10L)));
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
