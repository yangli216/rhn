package com.rhn.billing.infrastructure.fiscal;

import com.rhn.billing.infrastructure.fiscal.FiscalModels.*;
import com.rhn.shared.json.JsonCodec;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 财政电子票据 HTTP 网关客户端，协议见 rhn-thirdparty-mocks 的 docs/fiscal-mock-protocol.md
 * （字段与 {@link FiscalModels} 一一对应）。仅在 {@code rhn.billing.fiscal.gateway.enabled=true} 时装配，
 * 与进程内 Mock、拒绝执行的占位客户端互斥。
 *
 * <p>语义保持保守：平台明确拒绝（success=false 且 outcome=FAILED）是确定失败；超时、HTTP 非 2xx、回执非 JSON、
 * 缺少关键字段一律抛出 {@link FiscalGatewayException}（结果未知，由上层转待确认并按外部票据号查询恢复），
 * 绝不推定失败，以免重复开票。开具、作废、冲红的幂等键与申请号由调用方稳定提供，重试沿用原值。
 */
@Component
@EnableConfigurationProperties(FiscalGatewayProperties.class)
@ConditionalOnProperty(name = "rhn.billing.fiscal.gateway.enabled", havingValue = "true")
public class HttpFiscalReceiptClient implements NationalFiscalReceiptClient {
    /** 传输层缝隙：生产使用 JDK HttpClient，测试可替换。 */
    interface Transport {
        Response post(URI uri, Map<String, String> headers, String body) throws IOException, InterruptedException;
        record Response(int status, String body) {}
    }

    private final FiscalGatewayProperties properties;
    private final JsonCodec json;
    private final Transport transport;
    private final String base;

    @Autowired
    public HttpFiscalReceiptClient(FiscalGatewayProperties properties, JsonCodec json) {
        this(properties, json, httpTransport(properties));
    }

    HttpFiscalReceiptClient(FiscalGatewayProperties properties, JsonCodec json, Transport transport) {
        this.properties = properties; this.json = json; this.transport = transport;
        String url = properties.baseUrl().trim();
        this.base = url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
        URI.create(this.base);
    }

    private static Transport httpTransport(FiscalGatewayProperties properties) {
        HttpClient client = HttpClient.newBuilder().connectTimeout(properties.connectTimeout()).build();
        return (uri, headers, body) -> {
            var builder = HttpRequest.newBuilder(uri).timeout(properties.readTimeout())
                    .header("Content-Type", "application/json;charset=UTF-8")
                    .POST(HttpRequest.BodyPublishers.ofString(body));
            headers.forEach(builder::header);
            var response = client.send(builder.build(), HttpResponse.BodyHandlers.ofString());
            return new Transport.Response(response.statusCode(), response.body());
        };
    }

    @Override
    public FiscalIssueResponse issue(FiscalIssueRequest request) {
        require(text(request.receiptRequestNo()) && text(request.idempotencyKey()), "开具必须提供稳定的申请号与幂等键");
        return issueResponse("issue", call("issue", json.write(request)));
    }

    @Override
    public FiscalIssueResponse query(String receiptRequestNo, String externalReceiptNo, String correlationId) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("receiptRequestNo", receiptRequestNo); body.put("externalReceiptNo", externalReceiptNo);
        body.put("correlationId", correlationId);
        return issueResponse("query", call("query", json.write(body)));
    }

    @Override
    public FiscalVoidResponse voidReceipt(FiscalVoidRequest request) {
        require(text(request.idempotencyKey()) && text(request.externalReceiptNo()), "作废必须提供幂等键与外部票据号");
        JsonNode node = call("void", json.write(request));
        if (!success(node)) return FiscalVoidResponse.failed(errorCode(node), errorMessage(node));
        String externalNo = text(node, "externalReceiptNo");
        Instant voidedAt = instant(node, "voidedAt");
        require(externalNo != null && voidedAt != null, "作废成功回执缺少外部票据号或作废时间");
        return FiscalVoidResponse.success(externalNo, voidedAt);
    }

    @Override
    public FiscalRedFlushResponse redFlush(FiscalRedFlushRequest request) {
        require(text(request.idempotencyKey()) && text(request.originalExternalReceiptNo()), "冲红必须提供幂等键与原外部票据号");
        JsonNode node = call("redFlush", json.write(request));
        if (!success(node)) return FiscalRedFlushResponse.failed(errorCode(node), errorMessage(node));
        String no = text(node, "redExternalReceiptNo"), code = text(node, "redFiscalCode"), number = text(node, "redFiscalNumber");
        Instant issuedAt = instant(node, "issuedAt");
        require(no != null && code != null && number != null && issuedAt != null, "冲红成功回执缺少红票号、票据代码、号码或开具时间");
        return FiscalRedFlushResponse.success(no, code, number, text(node, "verificationCode"), text(node, "verifyUrl"), issuedAt);
    }

    // ==================== 回执解析 ====================

    private FiscalIssueResponse issueResponse(String operation, JsonNode node) {
        boolean success = success(node);
        String outcome = text(node, "outcome");
        require(outcome != null, operation + " 回执缺少业务状态 outcome");
        String externalNo = text(node, "externalReceiptNo");
        switch (outcome) {
            case "ISSUED" -> {
                String code = text(node, "fiscalCode"), number = text(node, "fiscalNumber"), check = text(node, "verificationCode");
                Instant issuedAt = instant(node, "issuedAt");
                require(success && externalNo != null && code != null && number != null && check != null && issuedAt != null,
                        operation + " 出票成功回执缺少外部票据号、票据代码、号码、校验码或开具时间");
                return FiscalIssueResponse.success(externalNo, code, number, check, text(node, "verifyUrl"), issuedAt);
            }
            case "VOIDED", "RED_FLUSHED" -> {
                require(success && externalNo != null, operation + " 回执 " + outcome + " 缺少外部票据号");
                return new FiscalIssueResponse(true, outcome, externalNo, text(node, "fiscalCode"), text(node, "fiscalNumber"),
                        text(node, "verificationCode"), text(node, "verifyUrl"), instant(node, "issuedAt"), null, null);
            }
            case "PENDING" -> {
                require(!success, operation + " 处理中回执的 success 标志矛盾");
                return FiscalIssueResponse.pending(externalNo, errorCode(node), errorMessage(node));
            }
            case "FAILED" -> {
                require(!success, operation + " 失败回执的 success 标志矛盾");
                return new FiscalIssueResponse(false, "FAILED", externalNo, null, null, null, null, null, errorCode(node), errorMessage(node));
            }
            default -> throw new FiscalGatewayException(operation + " 回执业务状态无法识别：" + outcome);
        }
    }

    private static boolean success(JsonNode node) {
        JsonNode value = node.path("success");
        if (!value.isBoolean()) throw new FiscalGatewayException("财政回执缺少 success 标志");
        return value.asBoolean();
    }

    private static String errorCode(JsonNode node) { return text(node, "errorCode"); }
    private static String errorMessage(JsonNode node) { return text(node, "errorMessage"); }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.path(field);
        if (value.isMissingNode() || value.isNull()) return null;
        String text = value.asString();
        return text == null || text.isBlank() ? null : text.trim();
    }

    private static Instant instant(JsonNode node, String field) {
        String value = text(node, field);
        if (value == null) return null;
        try { return Instant.parse(value); }
        catch (DateTimeParseException exception) { throw new FiscalGatewayException("财政回执时间 " + field + " 格式无效", exception); }
    }

    // ==================== 传输 ====================

    private JsonNode call(String operation, String body) {
        Transport.Response response;
        try {
            response = transport.post(URI.create(base + "/v1/receipts/" + operation), headers(), body);
        } catch (IOException exception) {
            throw new FiscalGatewayException("财政网关 " + operation + " 调用失败或超时，结果未知", exception);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new FiscalGatewayException("财政网关 " + operation + " 调用被中断，结果未知", exception);
        }
        if (response.status() < 200 || response.status() >= 300) {
            throw new FiscalGatewayException("财政网关 " + operation + " 返回 HTTP " + response.status() + "，结果未知");
        }
        JsonNode tree;
        try { tree = json.readTree(response.body()); }
        catch (RuntimeException exception) { throw new FiscalGatewayException("财政网关 " + operation + " 回执不是有效 JSON，结果未知", exception); }
        if (tree == null || !tree.isObject()) throw new FiscalGatewayException("财政网关 " + operation + " 回执不是 JSON 对象，结果未知");
        return tree;
    }

    private Map<String, String> headers() {
        return Map.of("X-Client-Id", properties.clientId(), "X-Client-Secret", properties.clientSecret());
    }

    private static void require(boolean valid, String message) { if (!valid) throw new FiscalGatewayException(message); }
    private static boolean text(String value) { return value != null && !value.isBlank(); }
}
