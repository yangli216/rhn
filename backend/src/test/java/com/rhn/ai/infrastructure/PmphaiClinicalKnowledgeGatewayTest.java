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
import java.util.List;
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

    @Test
    void evaluatesEvidenceChainThroughGatewayEndpoint() throws Exception {
        AtomicReference<String> requestBody = new AtomicReference<>();
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/gateway/api/knowledge/evidence-chain", exchange -> {
            requestBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] response = """
                    {
                      "success": true,
                      "protocolId": "PROT-HTN-001",
                      "protocolTitle": "原发性高血压门诊规范诊疗方案",
                      "diagnosis": { "code": "I10", "name": "原发性高血压 2级" },
                      "summary": "依据国家专科临床诊疗指南与规范，推导证据链确凿。",
                      "checkpoints": [
                        {
                          "status": "MET", "type": "VITAL",
                          "label": "诊室血压 168/102 mmHg ≥ 160/100 mmHg",
                          "detail": "达到 2 级高血压门槛", "sourceQuote": "非同日3次诊室测量"
                        }
                      ],
                      "gapOrders": [
                        {
                          "id": "gap-ecg", "name": "12导联心电图",
                          "category": "EXAMINATION", "orderType": "EXAMINATION",
                          "dept": "功能检查科", "indication": "排查左心室肥厚",
                          "defaultChecked": true
                        }
                      ],
                      "guidelines": [
                        {
                          "id": "SRC-CMA-CARD-2024-01",
                          "title": "中国高血压防治指南（2024年修订版）",
                          "chapter": "第4章", "authority": "中华医学会",
                          "publishYear": "2024", "docPath": "sources/SRC-CMA-CARD-2024-01.md",
                          "keyExcerpts": ["诊室血压≥140/90确立诊断"]
                        }
                      ]
                    }
                    """.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, response.length);
            exchange.getResponseBody().write(response);
            exchange.close();
        });
        server.start();

        var gateway = new PmphaiClinicalKnowledgeGateway(settings("test-key"), jsonCodec);
        var req = new com.rhn.ai.application.ClinicalKnowledgeGateway.EvidenceChainRequest(
                "原发性高血压 2级", "I10",
                new com.rhn.ai.application.ClinicalKnowledgeGateway.EvidenceChainRequest.PatientContext(
                        56, "男", "头晕2周", "伴晨起头胀", "吸烟史",
                        Map.of("systolicBp", 168, "diastolicBp", 102)
                )
        );
        var result = gateway.evaluateEvidenceChain(req, settings("test-key"));

        assertTrue(result.success());
        assertEquals("PROT-HTN-001", result.protocolId());
        assertEquals(1, result.checkpoints().size());
        assertEquals("MET", result.checkpoints().getFirst().status());
        assertEquals("12导联心电图", result.gapOrders().getFirst().name());
        assertEquals("中国高血压防治指南（2024年修订版）", result.guidelines().getFirst().title());
        assertTrue(requestBody.get().contains("原发性高血压 2级"));
    }

    @Test
    void lookupsWikiDocThroughGatewayEndpoint() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/gateway/api/knowledge/doc", exchange -> {
            String query = exchange.getRequestURI().getQuery();
            if (query != null && query.contains("厄贝沙坦片")) {
                byte[] response = """
                        {
                          "id": "厄贝沙坦片",
                          "title": "厄贝沙坦片 官方核准药品说明书",
                          "type": "drug_insert",
                          "genericName": "厄贝沙坦片",
                          "atcCode": "C09CA04",
                          "maxDailyDose": "300mg qd",
                          "html": "<h1>厄贝沙坦片</h1>"
                        }
                        """.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, response.length);
                exchange.getResponseBody().write(response);
            } else {
                exchange.sendResponseHeaders(404, -1);
            }
            exchange.close();
        });
        server.start();

        var gateway = new PmphaiClinicalKnowledgeGateway(settings(null), jsonCodec);
        var doc = gateway.lookupWikiDoc("厄贝沙坦片", "drug", settings(null));
        org.junit.jupiter.api.Assertions.assertNotNull(doc);
        assertEquals("厄贝沙坦片", doc.genericName());
        assertEquals("300mg qd", doc.maxDailyDose());

        var notFound = gateway.lookupWikiDoc("不存在的药物", "drug", settings(null));
        org.junit.jupiter.api.Assertions.assertNull(notFound);
    }

    @Test
    void evaluatesPreflightSafetyThroughGatewayEndpoint() throws Exception {
        AtomicReference<String> requestBody = new AtomicReference<>();
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/gateway/api/cdss/preflight-safety", exchange -> {
            requestBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] response = """
                    {
                      "success": true,
                      "canPrescribe": false,
                      "level": "BLOCK",
                      "summary": "【处方强行阻断】处方触发了最高级别绝对禁忌！",
                      "blockingCount": 1,
                      "warningCount": 0,
                      "evaluationBoundaries": {
                        "interactions": {
                          "status": "EVALUATED",
                          "evaluationCode": "PASS",
                          "message": "已依据指南完成配伍相互作用审查。",
                          "alerts": []
                        },
                        "contraindications": {
                          "status": "EVALUATED",
                          "evaluationCode": "BLOCKED",
                          "message": "已依据法定说明书完成禁忌核查。",
                          "alerts": [
                            {
                              "ruleId": "RULE-SAFETY-METFORMIN-RENAL",
                              "severity": "RED",
                              "title": "重度肾功能不全禁用二甲双胍",
                              "message": "eGFR < 30 ml/min，绝对禁用！",
                              "guideline": "临床诊疗指南"
                            }
                          ]
                        },
                        "dosageLimits": {
                          "status": "EVALUATED",
                          "evaluationCode": "PASS",
                          "message": "剂量审查通过。",
                          "alerts": []
                        }
                      },
                      "preflightChecks": [],
                      "allAlerts": []
                    }
                    """.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, response.length);
            exchange.getResponseBody().write(response);
            exchange.close();
        });
        server.start();

        var gateway = new PmphaiClinicalKnowledgeGateway(settings("test-key"), jsonCodec);
        var req = new com.rhn.ai.application.ClinicalKnowledgeGateway.PreflightSafetyRequest(
                List.of(new com.rhn.ai.application.ClinicalKnowledgeGateway.PreflightSafetyRequest.MedicationItem(
                        "盐酸二甲双胍片", "C10BA02", Map.of("doseValue", 500, "frequencyCode", "TID")
                )),
                Map.of("age", 65, "egfr", 25)
        );
        var result = gateway.evaluatePreflightSafety(req, settings("test-key"));

        assertTrue(result.success());
        assertFalse(result.canPrescribe());
        assertEquals("BLOCK", result.level());
        assertEquals(1, result.blockingCount());
        assertEquals("EVALUATED", result.evaluationBoundaries().contraindications().status());
        assertEquals("BLOCKED", result.evaluationBoundaries().contraindications().evaluationCode());
        assertEquals("重度肾功能不全禁用二甲双胍", result.evaluationBoundaries().contraindications().alerts().getFirst().title());
        assertTrue(requestBody.get().contains("盐酸二甲双胍片"));
    }

    private ClinicalAssistantSettings settings(String knowledgeApiKey) {
        return new ClinicalAssistantSettings("MODEL", "test-provider", "test-model", Duration.ofMinutes(30),
                "http://127.0.0.1:9/v1/chat/completions", "model-secret", Duration.ofSeconds(5), 1200,
                "", "gpt-transcribe", 20 * 1024 * 1024,
                "http://127.0.0.1:" + server.getAddress().getPort() + "/gateway/api/knowledge/search",
                knowledgeApiKey, 5);
    }

    private void startServer(com.sun.net.httpserver.HttpHandler handler) throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/gateway/api/knowledge/search", handler);
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
