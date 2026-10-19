package com.rhn.billing.web;

import com.rhn.billing.api.FiscalReceiptAdapter.ReceiptResult;
import com.rhn.billing.api.FiscalReceiptResultDirectory;
import com.rhn.billing.api.FiscalReceiptResultDirectory.VerifiedReceiptResult;
import com.rhn.billing.infrastructure.fiscal.FiscalGatewayProperties;
import com.rhn.platform.maintenance.api.MaintenanceExecutionScope;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.json.JsonCodec;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.HexFormat;
import java.util.Map;
import java.util.Set;

/**
 * 财政平台异步结果回调入口。该入口没有登录态，唯一的信任来源是 HMAC-SHA256 签名
 * （{@code X-Fiscal-Signature = hex(HMAC(secret, X-Fiscal-Timestamp + "." + 原始请求体))}）并限制时间窗口；
 * 验签失败、时间越界、报文无法解析时<strong>不会</strong>调用领域入口。验签通过后绑定配置固定的租户与机构，
 * 再交给 {@link FiscalReceiptResultDirectory}（同一外部业务消息号重复投递由领域侧幂等处理）。
 * 仅在 {@code rhn.billing.fiscal.gateway.callback.enabled=true} 时注册，路径为配置的精确路径。
 */
@RestController
@ConditionalOnProperty(name = "rhn.billing.fiscal.gateway.callback.enabled", havingValue = "true")
public class FiscalCallbackController {
    private final FiscalReceiptResultDirectory results;
    private final JsonCodec json;
    private final FiscalGatewayProperties.Callback callback;
    private final Clock clock;

    @org.springframework.beans.factory.annotation.Autowired
    public FiscalCallbackController(FiscalReceiptResultDirectory results, JsonCodec json, FiscalGatewayProperties properties) {
        this(results, json, properties, Clock.systemUTC());
    }

    FiscalCallbackController(FiscalReceiptResultDirectory results, JsonCodec json, FiscalGatewayProperties properties, Clock clock) {
        this.results = results; this.json = json; this.callback = properties.callback(); this.clock = clock;
    }

    @PostMapping("${rhn.billing.fiscal.gateway.callback.path:/integration/fiscal/callback}")
    ResponseEntity<Map<String, Object>> receive(@RequestBody String body,
                                                @RequestHeader(value = "X-Fiscal-Timestamp", required = false) String timestamp,
                                                @RequestHeader(value = "X-Fiscal-Signature", required = false) String signature) {
        if (!authentic(body, timestamp, signature)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("accepted", false, "code", "FISCAL_CALLBACK_SIGNATURE_INVALID"));
        }
        VerifiedReceiptResult verified;
        try { verified = map(json.readTree(body), body); }
        catch (RuntimeException exception) {
            return ResponseEntity.badRequest().body(Map.of("accepted", false, "code", "FISCAL_CALLBACK_MALFORMED"));
        }
        ExecutionContext actor = new ExecutionContext(callback.tenantId(), null, "fiscal-callback", "FISCAL-CB-" + verified.externalMessageBusinessId(),
                Set.of(), callback.organizationId(), callback.departmentId(), "DEPARTMENT", Set.of(callback.organizationId()),
                Set.of(callback.departmentId()), null);
        try (var scope = MaintenanceExecutionScope.bind(actor)) {
            results.accept(verified);
        }
        return ResponseEntity.ok(Map.of("accepted", true));
    }

    private boolean authentic(String body, String timestamp, String signature) {
        if (timestamp == null || signature == null || body == null) return false;
        long millis;
        try { millis = Long.parseLong(timestamp.trim()); }
        catch (NumberFormatException exception) { return false; }
        if (Math.abs(clock.millis() - millis) > callback.maxClockSkew().toMillis()) return false;
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(callback.secret().getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] expected = mac.doFinal((timestamp.trim() + "." + body).getBytes(StandardCharsets.UTF_8));
            byte[] actual = HexFormat.of().parseHex(signature.trim().toLowerCase());
            return MessageDigest.isEqual(expected, actual);
        } catch (GeneralSecurityException | IllegalArgumentException exception) {
            return false;
        }
    }

    private VerifiedReceiptResult map(JsonNode node, String rawBody) {
        return new VerifiedReceiptResult(
                text(node, "fiscalAuthorityCode"), text(node, "externalMessageBusinessId"), text(node, "commandCode"),
                text(node, "receiptRequestNo"),
                VerifiedReceiptResult.Operation.valueOf(required(node, "operation")),
                ReceiptResult.Outcome.valueOf(required(node, "outcome")),
                text(node, "externalReceiptNo"), text(node, "fiscalCode"), text(node, "fiscalNumber"),
                text(node, "verificationCode"), text(node, "verifyUrl"), instant(node, "issuedAt"),
                text(node, "actionReason"), text(node, "errorCode"), text(node, "errorMessage"), json.readObject(rawBody));
    }

    private static String required(JsonNode node, String field) {
        String value = text(node, field);
        if (value == null) throw new IllegalArgumentException(field);
        return value;
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.path(field);
        if (value.isMissingNode() || value.isNull()) return null;
        String text = value.asString();
        return text == null || text.isBlank() ? null : text.trim();
    }

    private static Instant instant(JsonNode node, String field) {
        String value = text(node, field);
        try { return value == null ? null : Instant.parse(value); }
        catch (DateTimeParseException exception) { throw new IllegalArgumentException(field, exception); }
    }
}
