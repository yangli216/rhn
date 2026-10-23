package com.rhn.billing.web;

import com.rhn.billing.api.FiscalReceiptAdapter.ReceiptResult;
import com.rhn.billing.api.FiscalReceiptResultDirectory;
import com.rhn.billing.api.FiscalReceiptResultDirectory.VerifiedReceiptResult;
import com.rhn.billing.infrastructure.fiscal.FiscalGatewayProperties;
import com.rhn.billing.infrastructure.fiscal.FiscalModels.*;
import com.rhn.billing.infrastructure.fiscal.HttpFiscalReceiptClient;
import com.rhn.shared.json.JsonCodec;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.math.BigDecimal;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 对真实 rhn-thirdparty-mocks 的 fiscal 协议做端到端联调：在随机端口启动其 jar（用完关闭，不占 18090），
 * 走 开具→处理中→签名回调→查询→重复开具→作废→冲红 的闭环，并验证错误签名回调不触达领域。
 * 默认跳过；运行时加 {@code -Drhn.fiscal.mock.jar=<rhn-thirdparty-mocks jar 路径>}。
 */
@EnabledIfSystemProperty(named = "rhn.fiscal.mock.jar", matches = ".+")
class FiscalMockLiveIntegrationTest {
    static final String SECRET = "callback-secret";
    final JsonMapper mapper = JsonMapper.builder().build();
    final JsonCodec json = new JsonCodec() {
        @Override public String write(Object value) { return mapper.writeValueAsString(value); }
        @Override public JsonNode readTree(String value) { return mapper.readTree(value); }
        @Override public <T> T read(String value, Class<T> type) { return mapper.readValue(value, type); }
        @Override @SuppressWarnings("unchecked")
        public Map<String, Object> readObject(String value) { return mapper.readValue(value, LinkedHashMap.class); }
    };
    final HttpClient http = HttpClient.newHttpClient();
    final List<VerifiedReceiptResult> accepted = new CopyOnWriteArrayList<>();
    final List<Integer> callbackStatuses = new CopyOnWriteArrayList<>();
    Process mock; HttpServer receiver; String base; HttpFiscalReceiptClient client; FiscalCallbackController controller;

    @BeforeEach
    void start() throws Exception {
        int port; try (var socket = new ServerSocket(0)) { port = socket.getLocalPort(); }
        mock = new ProcessBuilder("java", "-jar", System.getProperty("rhn.fiscal.mock.jar"), "--server.port=" + port, "--server.address=127.0.0.1")
                .redirectErrorStream(true).redirectOutput(ProcessBuilder.Redirect.DISCARD).start();
        base = "http://127.0.0.1:" + port;
        for (int i = 0; i < 60; i++) {
            try { if (get(base + "/mock/health").statusCode() == 200) break; } catch (Exception ignored) { Thread.sleep(1000); }
        }
        var properties = new FiscalGatewayProperties(true, base + "/fiscal", "mock-fiscal-client", "mock-fiscal-secret",
                Duration.ofSeconds(3), Duration.ofSeconds(10),
                new FiscalGatewayProperties.Callback(true, "/integration/fiscal/callback", SECRET, 1L, 2L, 3L, Duration.ofMinutes(5)));
        client = new HttpFiscalReceiptClient(properties, json);
        FiscalReceiptResultDirectory directory = result -> { accepted.add(result); return null; };
        controller = new FiscalCallbackController(directory, json, properties);
        receiver = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        receiver.createContext("/cb", exchange -> {
            String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            var response = controller.receive(body, exchange.getRequestHeaders().getFirst("X-Fiscal-Timestamp"),
                    exchange.getRequestHeaders().getFirst("X-Fiscal-Signature"));
            callbackStatuses.add(response.getStatusCode().value());
            byte[] out = json.write(response.getBody()).getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(response.getStatusCode().value(), out.length);
            exchange.getResponseBody().write(out); exchange.close();
        });
        receiver.start();
        put("/mock/config?protocol=fiscal", Map.of("callbackSecret", SECRET, "autoCallback", false,
                "callbackUrl", "http://127.0.0.1:" + receiver.getAddress().getPort() + "/cb"));
    }

    @AfterEach
    void stop() {
        if (receiver != null) receiver.stop(0);
        if (mock != null) mock.destroy();
    }

    @Test
    void fullReceiptLifecycleAgainstTheRealMock() throws Exception {
        var pending = client.issue(issue("RC-LIVE-1", "IDEM-LIVE-1", "TEST-PENDING"));
        assertThat(pending.outcome()).isEqualTo("PENDING");
        assertThat(pending.externalReceiptNo()).isNotBlank();
        String ref = pending.externalReceiptNo();

        // 重复开具沿用同一幂等键：仍是同一张处理中的票
        assertThat(client.issue(issue("RC-LIVE-1", "IDEM-LIVE-1", "TEST-PENDING")).externalReceiptNo()).isEqualTo(ref);

        // 平台完成出票并推送签名回调，经控制器验签后进入领域入口
        post("/mock/fiscal/receipts/" + ref + "/complete", Map.of("success", true, "push", true));
        assertThat(accepted).hasSize(1);
        var callback = accepted.getFirst();
        assertThat(callback.operation()).isEqualTo(VerifiedReceiptResult.Operation.ISSUE);
        assertThat(callback.outcome()).isEqualTo(ReceiptResult.Outcome.ISSUED);
        assertThat(callback.receiptRequestNo()).isEqualTo("RC-LIVE-1");
        assertThat(callback.externalReceiptNo()).isEqualTo(ref);
        assertThat(callback.fiscalNumber()).isNotBlank();
        assertThat(callbackStatuses).containsExactly(200);

        // 主动查询恢复得到相同的四要素
        var queried = client.query("RC-LIVE-1", ref, "CORR");
        assertThat(queried.success()).isTrue();
        assertThat(queried.fiscalNumber()).isEqualTo(callback.fiscalNumber());

        // 错误签名的回调：被控制器拒绝，不触达领域
        post("/mock/fiscal/receipts/" + ref + "/callback", Map.of("mode", "bad_signature"));
        assertThat(callbackStatuses).containsExactly(200, 401);
        assertThat(accepted).hasSize(1);

        // 作废后不可冲红
        var voided = client.voidReceipt(new FiscalVoidRequest(1L, "RC-LIVE-1", "VOID-LIVE-1", ref, "患者要求", "CORR"));
        assertThat(voided.success()).isTrue();
        assertThat(client.voidReceipt(new FiscalVoidRequest(1L, "RC-LIVE-1", "VOID-LIVE-2", ref, "患者要求", "CORR")).errorCode())
                .isEqualTo("FISCAL_ALREADY_VOIDED");
        assertThat(client.redFlush(new FiscalRedFlushRequest(1L, "RC-LIVE-1", "RED-LIVE-1", ref, null, null, "冲红", "CORR")).errorCode())
                .isEqualTo("FISCAL_RECEIPT_VOIDED");

        // 另一张正常票：开具成功后冲红，同键重放得到同一张红票
        var issued = client.issue(issue("RC-LIVE-2", "IDEM-LIVE-2", "张三"));
        assertThat(issued.success()).isTrue();
        var red = client.redFlush(new FiscalRedFlushRequest(2L, "RC-LIVE-2", "RED-LIVE-2", issued.externalReceiptNo(), null, null, "冲红", "CORR"));
        assertThat(red.success()).isTrue();
        assertThat(red.redExternalReceiptNo()).startsWith("RED-");
        assertThat(client.redFlush(new FiscalRedFlushRequest(2L, "RC-LIVE-2", "RED-LIVE-2", issued.externalReceiptNo(), null, null, "冲红", "CORR"))
                .redExternalReceiptNo()).isEqualTo(red.redExternalReceiptNo());
    }

    @Test
    void platformRejectionAndTransportFailuresMapToTheRightSemantics() throws Exception {
        assertThat(client.issue(issue("RC-LIVE-3", "IDEM-LIVE-3", "TEST-FAIL")).outcome()).isEqualTo("FAILED");
        org.junit.jupiter.api.Assertions.assertThrows(IllegalStateException.class, () -> client.issue(issue("RC-LIVE-4", "IDEM-LIVE-4", "TEST-HTTP500")));
        org.junit.jupiter.api.Assertions.assertThrows(IllegalStateException.class, () -> client.issue(issue("RC-LIVE-5", "IDEM-LIVE-5", "TEST-BADJSON")));
    }

    FiscalIssueRequest issue(String requestNo, String key, String payer) {
        return new FiscalIssueRequest(1L, 2L, requestNo, key, "MEDICAL_E_INVOICE", "CASHIER", "FISCAL", payer, null,
                new BigDecimal("10.00"), BigDecimal.ZERO, null, null, new BigDecimal("10.00"), null, "CNY",
                List.of(new FiscalItem(1, "CAT", "I1", "诊察费", BigDecimal.ONE, new BigDecimal("10.00"))), "CORR");
    }

    HttpResponse<String> get(String url) throws Exception {
        return http.send(HttpRequest.newBuilder(URI.create(url)).GET().build(), HttpResponse.BodyHandlers.ofString());
    }

    void post(String path, Object body) throws Exception {
        var response = http.send(HttpRequest.newBuilder(URI.create(base + path)).header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(json.write(body))).build(), HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
    }

    void put(String path, Object body) throws Exception {
        var response = http.send(HttpRequest.newBuilder(URI.create(base + path)).header("Content-Type", "application/json")
                .PUT(HttpRequest.BodyPublishers.ofString(json.write(body))).build(), HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
    }
}
