package com.rhn.billing.infrastructure.fiscal;

import com.rhn.billing.infrastructure.fiscal.FiscalModels.*;
import com.rhn.shared.json.JsonCodec;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.math.BigDecimal;
import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class HttpFiscalReceiptClientTest {
    final JsonMapper mapper = JsonMapper.builder().build();
    final JsonCodec json = new JsonCodec() {
        @Override public String write(Object value) { return mapper.writeValueAsString(value); }
        @Override public JsonNode readTree(String value) { return mapper.readTree(value); }
        @Override public <T> T read(String value, Class<T> type) { return mapper.readValue(value, type); }
        @Override @SuppressWarnings("unchecked")
        public Map<String, Object> readObject(String value) { return mapper.readValue(value, LinkedHashMap.class); }
    };
    final List<URI> uris = new ArrayList<>();
    final List<Map<String, String>> headers = new ArrayList<>();
    final List<JsonNode> bodies = new ArrayList<>();
    Function<String, HttpFiscalReceiptClient.Transport.Response> reply;
    HttpFiscalReceiptClient client;

    static FiscalGatewayProperties properties() {
        return new FiscalGatewayProperties(true, "http://fiscal.invalid/fiscal/", "cid", "csecret",
                Duration.ofSeconds(1), Duration.ofSeconds(1), null);
    }

    @BeforeEach
    void setup() {
        client = new HttpFiscalReceiptClient(properties(), json, (uri, h, body) -> {
            uris.add(uri); headers.add(h); bodies.add(json.readTree(body));
            String operation = uri.getPath().substring(uri.getPath().lastIndexOf('/') + 1);
            var response = reply.apply(operation);
            if (response.status() < 0) throw new IOException("timeout");
            return response;
        });
    }

    static HttpFiscalReceiptClient.Transport.Response ok(String body) { return new HttpFiscalReceiptClient.Transport.Response(200, body); }

    FiscalIssueRequest issueRequest() {
        return new FiscalIssueRequest(1L, 2L, "RC-1", "IDEM-1", "MEDICAL_E_INVOICE", "CASHIER", "FISCAL", "张三", null,
                new BigDecimal("10.00"), BigDecimal.ZERO, null, null, new BigDecimal("10.00"), null, "CNY",
                List.of(new FiscalItem(1, "CAT", "I1", "诊察费", BigDecimal.ONE, new BigDecimal("10.00"))), "CORR");
    }

    static final String ISSUED = "{\"success\":true,\"outcome\":\"ISSUED\",\"externalReceiptNo\":\"EINV-1\",\"fiscalCode\":\"3600060125\","
            + "\"fiscalNumber\":\"0000000001\",\"verificationCode\":\"ABC123\",\"verifyUrl\":\"http://v/1\",\"issuedAt\":\"2026-10-19T08:30:00.123Z\"}";

    @Test
    void issueSendsStableKeysWithCredentialsAndParsesTheFourElements() {
        reply = op -> ok(ISSUED);
        var response = client.issue(issueRequest());

        assertThat(response.success()).isTrue();
        assertThat(response.outcome()).isEqualTo("ISSUED");
        assertThat(response.externalReceiptNo()).isEqualTo("EINV-1");
        assertThat(response.fiscalNumber()).isEqualTo("0000000001");
        assertThat(response.issuedAt()).isEqualTo(Instant.parse("2026-10-19T08:30:00.123Z"));
        assertThat(uris.getFirst().toString()).isEqualTo("http://fiscal.invalid/fiscal/v1/receipts/issue");
        assertThat(headers.getFirst()).containsEntry("X-Client-Id", "cid").containsEntry("X-Client-Secret", "csecret");
        JsonNode sent = bodies.getFirst();
        assertThat(sent.path("receiptRequestNo").asString()).isEqualTo("RC-1");
        assertThat(sent.path("idempotencyKey").asString()).isEqualTo("IDEM-1");
        assertThat(sent.path("totalAmount").decimalValue()).isEqualByComparingTo("10.00");
        assertThat(sent.path("items").get(0).path("itemCode").asString()).isEqualTo("I1");
    }

    @Test
    void pendingKeepsTheExternalNumberAndIsNeverTreatedAsFailure() {
        reply = op -> ok("{\"success\":false,\"outcome\":\"PENDING\",\"externalReceiptNo\":\"EINV-2\",\"errorCode\":\"FISCAL_PROCESSING\",\"errorMessage\":\"处理中\"}");
        var response = client.issue(issueRequest());
        assertThat(response.outcome()).isEqualTo("PENDING");
        assertThat(response.externalReceiptNo()).isEqualTo("EINV-2");
        assertThat(response.success()).isFalse();
    }

    @Test
    void explicitRejectionIsDefiniteFailure() {
        reply = op -> ok("{\"success\":false,\"outcome\":\"FAILED\",\"errorCode\":\"FISCAL_ISSUE_REJECTED\",\"errorMessage\":\"平台拒绝\"}");
        var response = client.issue(issueRequest());
        assertThat(response.outcome()).isEqualTo("FAILED");
        assertThat(response.errorCode()).isEqualTo("FISCAL_ISSUE_REJECTED");
        assertThat(response.externalReceiptNo()).isNull();
    }

    @Test
    void transportFailuresAreUncertainNeverFailure() {
        reply = op -> new HttpFiscalReceiptClient.Transport.Response(500, "oops");
        assertThatThrownBy(() -> client.issue(issueRequest())).isInstanceOf(FiscalGatewayException.class).hasMessageContaining("HTTP 500");
        reply = op -> ok("<html>not json</html>");
        assertThatThrownBy(() -> client.issue(issueRequest())).isInstanceOf(FiscalGatewayException.class).hasMessageContaining("有效 JSON");
        reply = op -> ok("[1,2]");
        assertThatThrownBy(() -> client.query("RC-1", "EINV-1", "C")).isInstanceOf(FiscalGatewayException.class);
        reply = op -> new HttpFiscalReceiptClient.Transport.Response(-1, "");
        assertThatThrownBy(() -> client.issue(issueRequest())).isInstanceOf(FiscalGatewayException.class).hasMessageContaining("结果未知");
    }

    @Test
    void successWithoutKeyFieldsOrWithContradictingFlagsIsNotAccepted() {
        for (String missing : List.of("externalReceiptNo", "fiscalCode", "fiscalNumber", "verificationCode", "issuedAt")) {
            var node = (tools.jackson.databind.node.ObjectNode) json.readTree(ISSUED);
            node.remove(missing);
            reply = op -> ok(node.toString());
            assertThatThrownBy(() -> client.issue(issueRequest())).as(missing).isInstanceOf(FiscalGatewayException.class);
        }
        reply = op -> ok(ISSUED.replace("\"success\":true", "\"success\":false"));
        assertThatThrownBy(() -> client.issue(issueRequest())).isInstanceOf(FiscalGatewayException.class);
        reply = op -> ok("{\"success\":true,\"outcome\":\"WHATEVER\"}");
        assertThatThrownBy(() -> client.issue(issueRequest())).isInstanceOf(FiscalGatewayException.class).hasMessageContaining("无法识别");
        reply = op -> ok("{\"outcome\":\"ISSUED\"}");
        assertThatThrownBy(() -> client.issue(issueRequest())).isInstanceOf(FiscalGatewayException.class).hasMessageContaining("success");
    }

    @Test
    void issueRequiresStableKeysBeforeAnythingIsSent() {
        var bad = new FiscalIssueRequest(1L, 2L, "RC-1", " ", "MEDICAL_E_INVOICE", "CASHIER", "FISCAL", "张三", null,
                BigDecimal.TEN, BigDecimal.ZERO, null, null, BigDecimal.TEN, null, "CNY", List.of(), "C");
        assertThatThrownBy(() -> client.issue(bad)).isInstanceOf(FiscalGatewayException.class);
        assertThat(uris).isEmpty();
    }

    @Test
    void queryMapsVoidedAndRedStatesAsSuccessfulBusinessStates() {
        reply = op -> ok(ISSUED.replace("\"ISSUED\"", "\"VOIDED\""));
        var voided = client.query("RC-1", "EINV-1", "C");
        assertThat(voided.success()).isTrue();
        assertThat(voided.outcome()).isEqualTo("VOIDED");
        assertThat(bodies.getFirst().path("externalReceiptNo").asString()).isEqualTo("EINV-1");
        assertThat(uris.getFirst().getPath()).endsWith("/query");
        reply = op -> ok("{\"success\":false,\"outcome\":\"FAILED\",\"errorCode\":\"FISCAL_RECEIPT_NOT_FOUND\",\"errorMessage\":\"查无此票\"}");
        assertThat(client.query("RC-9", null, "C").errorCode()).isEqualTo("FISCAL_RECEIPT_NOT_FOUND");
    }

    @Test
    void voidAndRedFlushSucceedOrFailExplicitlyAndRejectIncompleteSuccess() {
        reply = op -> ok("{\"success\":true,\"externalReceiptNo\":\"EINV-1\",\"voidedAt\":\"2026-10-19T09:00:00Z\"}");
        var voided = client.voidReceipt(new FiscalVoidRequest(1L, "RC-1", "VOID-1", "EINV-1", "原因", "C"));
        assertThat(voided.success()).isTrue();
        assertThat(voided.voidedAt()).isEqualTo(Instant.parse("2026-10-19T09:00:00Z"));
        assertThat(bodies.getFirst().path("idempotencyKey").asString()).isEqualTo("VOID-1");
        assertThat(uris.getFirst().getPath()).endsWith("/void");

        reply = op -> ok("{\"success\":false,\"errorCode\":\"FISCAL_ALREADY_VOIDED\",\"errorMessage\":\"已作废\"}");
        assertThat(client.voidReceipt(new FiscalVoidRequest(1L, "RC-1", "VOID-2", "EINV-1", "原因", "C")).errorCode())
                .isEqualTo("FISCAL_ALREADY_VOIDED");
        reply = op -> ok("{\"success\":true,\"externalReceiptNo\":\"EINV-1\"}");
        assertThatThrownBy(() -> client.voidReceipt(new FiscalVoidRequest(1L, "RC-1", "VOID-3", "EINV-1", "原因", "C")))
                .isInstanceOf(FiscalGatewayException.class);

        reply = op -> ok("{\"success\":true,\"redExternalReceiptNo\":\"RED-EINV-1\",\"redFiscalCode\":\"3600060125\",\"redFiscalNumber\":\"0000000002\","
                + "\"verificationCode\":\"Z\",\"verifyUrl\":\"http://v/2\",\"issuedAt\":\"2026-10-19T10:00:00Z\"}");
        var red = client.redFlush(new FiscalRedFlushRequest(1L, "RC-1", "RED-1", "EINV-1", null, null, "原因", "C"));
        assertThat(red.success()).isTrue();
        assertThat(red.redExternalReceiptNo()).isEqualTo("RED-EINV-1");
        assertThat(bodies.getLast().path("originalExternalReceiptNo").asString()).isEqualTo("EINV-1");
        reply = op -> ok("{\"success\":true,\"redExternalReceiptNo\":\"RED-EINV-1\"}");
        assertThatThrownBy(() -> client.redFlush(new FiscalRedFlushRequest(1L, "RC-1", "RED-2", "EINV-1", null, null, "原因", "C")))
                .isInstanceOf(FiscalGatewayException.class);
        reply = op -> ok("{\"success\":false,\"errorCode\":\"FISCAL_RECEIPT_VOIDED\",\"errorMessage\":\"已作废不可冲红\"}");
        assertThat(client.redFlush(new FiscalRedFlushRequest(1L, "RC-1", "RED-3", "EINV-1", null, null, "原因", "C")).success()).isFalse();
    }

    @Test
    void credentialsNeverAppearInToString() {
        assertThat(properties().toString()).doesNotContain("csecret").doesNotContain("cid");
    }

    @Test
    void gatewayAndMockAreMutuallyExclusiveAndStandardIsTheFallback() {
        var runner = new ApplicationContextRunner().withBean(JsonCodec.class, () -> json)
                .withUserConfiguration(StandardFiscalReceiptClient.class, HttpFiscalReceiptClient.class, MockFiscalReceiptClient.class);
        runner.run(context -> assertThat(context.getBean(NationalFiscalReceiptClient.class)).isInstanceOf(StandardFiscalReceiptClient.class));
        runner.withPropertyValues("rhn.billing.fiscal.mock-enabled=true")
                .run(context -> assertThat(context.getBean(NationalFiscalReceiptClient.class)).isInstanceOf(MockFiscalReceiptClient.class));
        var gateway = new String[]{"rhn.billing.fiscal.gateway.enabled=true", "rhn.billing.fiscal.gateway.base-url=http://x/fiscal",
                "rhn.billing.fiscal.gateway.client-id=c", "rhn.billing.fiscal.gateway.client-secret=s"};
        runner.withPropertyValues(gateway).run(context -> assertThat(context.getBean(NationalFiscalReceiptClient.class))
                .isInstanceOf(HttpFiscalReceiptClient.class));
        // 两者同时开启时存在两个候选，适配器注入 NationalFiscalReceiptClient 会启动失败，而不是静默择一
        runner.withPropertyValues(gateway).withPropertyValues("rhn.billing.fiscal.mock-enabled=true").run(context -> {
            assertThat(context.getBeansOfType(NationalFiscalReceiptClient.class)).hasSize(2);
            assertThatThrownBy(() -> context.getBean(NationalFiscalReceiptClient.class))
                    .isInstanceOf(org.springframework.beans.factory.NoUniqueBeanDefinitionException.class);
        });
        runner.withPropertyValues("rhn.billing.fiscal.gateway.enabled=true").run(context -> assertThat(context).hasFailed());
        runner.withPropertyValues(gateway).withPropertyValues("rhn.billing.fiscal.gateway.callback.enabled=true")
                .run(context -> assertThat(context).hasFailed());
    }
}
