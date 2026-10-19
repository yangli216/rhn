package com.rhn.platform.cryptography.infrastructure.ca.mock;

import com.rhn.platform.cryptography.api.SigningMode;
import com.rhn.platform.cryptography.application.CaProperties;
import com.rhn.platform.cryptography.application.CaProperties.Connection;
import com.rhn.platform.cryptography.application.CaVendorRegistry;
import com.rhn.platform.cryptography.infrastructure.SmCrypto;
import com.rhn.platform.cryptography.spi.CaMobileLoginPort;
import com.rhn.platform.cryptography.spi.CaRemoteSigningPort;
import com.rhn.platform.cryptography.spi.CaRemoteSigningPort.RemoteOrderRef;
import com.rhn.platform.cryptography.spi.CaSignerEnrollmentPort;
import com.rhn.platform.cryptography.spi.CaSigningGrantPort;
import com.rhn.platform.cryptography.spi.SignatureFormat;
import com.rhn.shared.json.JsonCodec;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpTimeoutException;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.cert.X509Certificate;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class MockCaVendorAdapterTest {
    static final Instant NOW = Instant.parse("2026-10-19T02:00:00Z");
    static final String SECRET = "super-secret-value";
    final JsonMapper mapper = JsonMapper.builder().build();
    final JsonCodec json = new JsonCodec() {
        @Override public String write(Object value) { return mapper.writeValueAsString(value); }
        @Override public JsonNode readTree(String value) { return mapper.readTree(value); }
        @Override public <T> T read(String value, Class<T> type) { return mapper.readValue(value, type); }
        @Override @SuppressWarnings("unchecked")
        public Map<String, Object> readObject(String value) { return mapper.readValue(value, java.util.LinkedHashMap.class); }
    };
    final List<String> operations = new ArrayList<>();
    final List<JsonNode> bodies = new ArrayList<>();
    final List<Map<String, String>> headers = new ArrayList<>();
    final Map<String, Function<JsonNode, MockCaClient.Transport.Response>> routes = new java.util.HashMap<>();
    MockCaVendorAdapter adapter;
    KeyPair rootKeys, tsaKeys;
    X509Certificate root, tsa;

    static CaProperties properties(boolean enabled) {
        var connection = new Connection(1L, 2L, "http://ca.invalid/ca/", "mock-ca-client", SECRET, Duration.ofSeconds(1), Duration.ofSeconds(2));
        return new CaProperties(true, "mock-ca", null, null, null, null, 8, false, 2000, 50, null, null,
                Map.of("mock-ca", new CaProperties.VendorSettings(enabled, List.of(connection))));
    }

    static MockCaClient.Transport.Response ok(String data) {
        return new MockCaClient.Transport.Response(200, "{\"code\":0,\"message\":\"OK\",\"requestId\":\"r\",\"data\":" + data + "}");
    }

    void route(String op, String data) { routes.put(op, body -> ok(data)); }

    @BeforeEach
    void setup() {
        rootKeys = SmCrypto.generateKeyPair(); tsaKeys = SmCrypto.generateKeyPair();
        root = SmCrypto.issue("CN=Mock Root,O=TEST", rootKeys.getPublic(), "CN=Mock Root,O=TEST", rootKeys.getPrivate(),
                NOW.minusSeconds(86400), NOW.plusSeconds(86400 * 30), true);
        tsa = SmCrypto.issue("CN=Mock TSA,O=TEST", tsaKeys.getPublic(), "CN=Mock Root,O=TEST", rootKeys.getPrivate(),
                NOW.minusSeconds(86400), NOW.plusSeconds(86400 * 30), false);
        adapter = new MockCaVendorAdapter(properties(true), json, (uri, hdr, body, connect, read) -> {
            String path = uri.getPath();
            String op = path.substring(path.indexOf("/v1/") + 4);
            operations.add(op); headers.add(hdr); bodies.add(json.readTree(body));
            var route = routes.get(op);
            if (route == null) return new MockCaClient.Transport.Response(404, "{}");
            return route.apply(json.readTree(body));
        }, Clock.fixed(NOW, ZoneOffset.UTC));
        route("trust/anchors", "{\"certificates\":[\"" + b64(root) + "\"],\"timestampAuthority\":\"mock-ca-tsa\",\"timestampCertificate\":\"" + b64(tsa) + "\"}");
    }

    static String b64(X509Certificate certificate) { return Base64.getEncoder().encodeToString(SmCrypto.encoded(certificate)); }

    @Test
    void capabilitiesAreDevelopmentOnlyAndRegistryGateStaysClosedWhenEnforced() {
        assertThat(adapter.vendorCode()).isEqualTo("mock-ca");
        assertThat(adapter.capabilities().assurance().name()).isEqualTo("DEVELOPMENT_ONLY");
        assertThat(adapter.capabilities().signingModes()).contains(SigningMode.PUSH, SigningMode.QR_CLAIM, SigningMode.AUTO, SigningMode.CLIENT_TOKEN);
        assertThat(adapter.capabilities().formats()).contains(SignatureFormat.SM2_ENVELOPE, SignatureFormat.SM2_STATEMENT);
        assertThat(adapter.capabilities().batchQueryLimit()).isEqualTo(100);
        assertThat(adapter.configured(1L, 2L)).isTrue();
        assertThat(adapter.configured(1L, 9L)).isFalse();
        assertThat(adapter.configured(5L, 2L)).isFalse();
        assertThatThrownBy(() -> new CaVendorRegistry(List.of(adapter), properties(true), true))
                .hasMessageContaining("Development CA adapter must not run with compliance enforcement");
        assertThat(new CaVendorRegistry(List.of(adapter), properties(true), false).forOrganization(1L, 2L)).isPresent();
    }

    @Test
    void configurationIsValidatedAndSecretsNeverPrinted() {
        assertThatThrownBy(() -> new CaProperties.VendorSettings(true, List.of())).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new Connection(1L, null, "ftp://x", "id", "secret", null, null)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new Connection(1L, null, "http://x", "id", " ", null, null)).isInstanceOf(IllegalArgumentException.class);
        assertThat(new CaProperties.VendorSettings(false, List.of()).organizations()).isEmpty();
        var tenantWide = new Connection(1L, null, "http://tenant", "id", SECRET, null, null);
        var exact = new Connection(1L, 2L, "http://exact", "id", SECRET, null, null);
        var settings = new CaProperties.VendorSettings(true, List.of(tenantWide, exact));
        assertThat(settings.connectionFor(1L, 2L).orElseThrow().baseUrl()).isEqualTo("http://exact");
        assertThat(settings.connectionFor(1L, 3L).orElseThrow().baseUrl()).isEqualTo("http://tenant");
        assertThat(settings.connectionFor(2L, 2L)).isEmpty();
        assertThat(exact.toString()).doesNotContain(SECRET).doesNotContain("id=");
        assertThatThrownBy(() -> new MockCaVendorAdapter(properties(false), json, null, Clock.systemUTC()))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void enrollmentAndQueryMapVendorState() {
        route("signers/enroll", "{\"externalSignerId\":\"mock-7\",\"state\":\"READY\",\"certificate\":\"CERT\",\"certificateNotAfter\":\"2027-10-19T00:00:00Z\",\"message\":\"ok\"}");
        route("signers/query", "{\"externalSignerId\":\"mock-7\",\"state\":\"DISABLED\",\"certificate\":null,\"message\":\"证书已吊销：x\"}");
        var port = adapter.enrollment().orElseThrow();
        var enrolled = port.enroll(1L, 2L, new CaSignerEnrollmentPort.SignerProfile(7L, 70L, "张医生", "ID", "110101199001010011", "13800000000", "内科"));
        assertThat(enrolled.state()).isEqualTo(CaSignerEnrollmentPort.State.READY);
        assertThat(enrolled.certificateNotAfter()).isEqualTo(Instant.parse("2027-10-19T00:00:00Z"));
        assertThat(bodies.getFirst().path("identityNumber").asString()).isEqualTo("110101199001010011");
        assertThat(headers.getFirst()).containsEntry("X-Client-Id", "mock-ca-client").containsEntry("X-Client-Secret", SECRET);
        assertThat(port.query(1L, 2L, "mock-7").state()).isEqualTo(CaSignerEnrollmentPort.State.DISABLED);
    }

    @Test
    void mobileLoginAndGrants() {
        route("login/mobile/start", "{\"externalRequestId\":\"L1\",\"qrContent\":\"mock-ca://login/L1\",\"expiresAt\":\"2026-10-19T02:02:00Z\"}");
        route("login/mobile/poll", "{\"state\":\"CONFIRMED\",\"externalSignerId\":\"mock-7\",\"certificate\":\"C\",\"autoSignGranted\":true}");
        var login = adapter.mobileLogin().orElseThrow();
        assertThat(login.start(1L, 2L, true, 4).qrContent()).isEqualTo("mock-ca://login/L1");
        assertThat(bodies.getFirst().path("autoSignHours").asInt()).isEqualTo(4);
        var result = login.poll(1L, 2L, "L1");
        assertThat(result.state()).isEqualTo(CaMobileLoginPort.State.CONFIRMED);
        assertThat(result.autoSignGranted()).isTrue();

        route("grants/request", "{\"qrContent\":\"mock-ca://grant/G1\",\"expiresAt\":\"2026-10-19T02:02:00Z\"}");
        route("grants/query", "{\"state\":\"GRANTED\"}");
        route("grants/revoke", "{\"state\":\"NONE\"}");
        var grants = adapter.signingGrant().orElseThrow();
        assertThat(grants.request(1L, 2L, "mock-7", Duration.ofHours(4)).qrContent()).contains("grant");
        assertThat(bodies.getLast().path("durationSeconds").asLong()).isEqualTo(14400);
        assertThat(grants.query(1L, 2L, "mock-7")).isEqualTo(CaSigningGrantPort.GrantState.GRANTED);
        grants.revoke(1L, 2L, "mock-7");
        assertThat(operations).endsWith("grants/revoke");
    }

    @Test
    void remoteSigningSubmitQueryBatchFetchCancel() {
        route("signing/submit", "{\"externalOrderId\":\"O1\",\"state\":\"AWAITING_SIGNER\",\"claimContent\":\"mock-ca://claim/O1\"}");
        route("signing/query", "{\"externalOrderId\":\"O1\",\"state\":\"FAILED\",\"errorCode\":\"CA_SIGN_FAILED\",\"message\":\"签名失败\"}");
        route("signing/fetch", "{\"format\":\"SM2_ENVELOPE\",\"signatureValue\":\"SIG\",\"certificate\":\"CERT\",\"signedEnvelope\":\"{}\",\"signedAt\":\"2026-10-19T02:01:00Z\",\"timestampAuthority\":\"mock-ca-tsa\",\"timestampToken\":\"T\"}");
        route("signing/cancel", "{\"externalOrderId\":\"O1\",\"state\":\"CANCELLED\"}");
        var port = adapter.remoteSigning().orElseThrow();
        var submitted = port.submit(new CaRemoteSigningPort.RemoteSigningRequest(1L, 2L, 99L, "mock-7", SigningMode.QR_CLAIM,
                "OUTPATIENT_NOTE", "SM3", new byte[32], "门诊病历", "张*", NOW.plusSeconds(3600)));
        assertThat(submitted.state()).isEqualTo(CaRemoteSigningPort.RemoteState.AWAITING_SIGNER);
        assertThat(submitted.claimContent()).isEqualTo("mock-ca://claim/O1");
        assertThat(bodies.getFirst().path("signingOrderId").asString()).isEqualTo("99");
        assertThat(bodies.getFirst().path("statementDigest").asString()).isEqualTo(Base64.getEncoder().encodeToString(new byte[32]));

        var ref = new RemoteOrderRef(1L, 2L, 99L, "O1");
        var failed = port.query(ref);
        assertThat(failed.state()).isEqualTo(CaRemoteSigningPort.RemoteState.FAILED);
        assertThat(failed.message()).contains("CA_SIGN_FAILED").contains("签名失败");

        var signature = port.fetch(ref);
        assertThat(signature.format()).isEqualTo(SignatureFormat.SM2_ENVELOPE);
        assertThat(signature.signedAt()).isEqualTo(Instant.parse("2026-10-19T02:01:00Z"));
        port.cancel(ref);
        assertThat(operations).endsWith("signing/cancel");

        // 超过 100 条按批拆分，并保持输入顺序。
        routes.put("signing/query-batch", body -> {
            var orders = new ArrayList<String>();
            for (JsonNode id : body.path("externalOrderIds"))
                orders.add("{\"externalOrderId\":\"" + id.asString() + "\",\"state\":\"SIGNED\"}");
            return ok("{\"orders\":[" + String.join(",", orders) + "]}");
        });
        operations.clear();
        var refs = new ArrayList<RemoteOrderRef>();
        for (int i = 0; i < 230; i++) refs.add(new RemoteOrderRef(1L, 2L, (long) i, "O" + i));
        var statuses = port.queryBatch(refs);
        assertThat(statuses).hasSize(230);
        assertThat(statuses.get(229).externalOrderId()).isEqualTo("O229");
        assertThat(operations).containsExactly("signing/query-batch", "signing/query-batch", "signing/query-batch");
    }

    @Test
    void trustAnchorsAreCachedAndStaleCopyUsedWhenVendorIsDown() {
        var verification = adapter.verification();
        assertThat(verification.trustAnchors(1L, 2L)).hasSize(1);
        verification.trustAnchors(1L, 2L);
        assertThat(operations.stream().filter("trust/anchors"::equals)).hasSize(1);

        var clock = new MutableClock(NOW);
        var failing = new ArrayList<Boolean>(List.of(false));
        var local = new MockCaVendorAdapter(properties(true), json, (uri, hdr, body, c, r) -> {
            if (failing.getFirst()) throw new HttpTimeoutException("slow");
            return ok("{\"certificates\":[\"" + b64(root) + "\"]}");
        }, clock);
        assertThat(local.verification().trustAnchors(1L, 2L)).hasSize(1);
        clock.advance(Duration.ofMinutes(10));
        failing.set(0, true);
        assertThat(local.verification().trustAnchors(1L, 2L)).hasSize(1);
    }

    @Test
    void timestampStampAndLocalVerification() {
        byte[] signature = "signature-value".getBytes(StandardCharsets.UTF_8);
        String payload = "{\"authority\":\"mock-ca-tsa\",\"time\":\"2026-10-19T02:00:30Z\",\"digest\":\""
                + Base64.getEncoder().encodeToString(SmCrypto.digest(SmCrypto.SM3, signature)) + "\"}";
        byte[] payloadBytes = payload.getBytes(StandardCharsets.UTF_8);
        String token = Base64.getEncoder().encodeToString(payloadBytes) + "."
                + Base64.getEncoder().encodeToString(SmCrypto.sign(tsaKeys.getPrivate(), payloadBytes));
        route("timestamp/stamp", "{\"authority\":\"mock-ca-tsa\",\"token\":\"" + token + "\",\"time\":\"2026-10-19T02:00:30Z\"}");

        var stamped = adapter.timestamp().orElseThrow().stamp(1L, 2L, signature);
        assertThat(stamped.authority()).isEqualTo("mock-ca-tsa");
        var verification = adapter.verification();
        assertThat(verification.verifyTimestamp(stamped.authority(), stamped.token(), signature)).contains(Instant.parse("2026-10-19T02:00:30Z"));
        // 数据被替换、授权方不符、令牌被篡改、签名不是时间戳证书签发 → 一律不可信。
        assertThat(verification.verifyTimestamp("mock-ca-tsa", token, "other".getBytes(StandardCharsets.UTF_8))).isEmpty();
        assertThat(verification.verifyTimestamp("other-tsa", token, signature)).isEmpty();
        assertThat(verification.verifyTimestamp("mock-ca-tsa", "x." + token.split("\\.")[1], signature)).isEmpty();
        assertThat(verification.verifyTimestamp("mock-ca-tsa", "garbage", signature)).isEmpty();
        KeyPair stranger = SmCrypto.generateKeyPair();
        String forged = Base64.getEncoder().encodeToString(payloadBytes) + "."
                + Base64.getEncoder().encodeToString(SmCrypto.sign(stranger.getPrivate(), payloadBytes));
        assertThat(verification.verifyTimestamp("mock-ca-tsa", forged, signature)).isEmpty();
    }

    @Test
    void envelopeMustEmbedTheStatementDigest() {
        byte[] digest = SmCrypto.digest(SmCrypto.SM3, "statement".getBytes(StandardCharsets.UTF_8));
        String envelope = "{\"vendor\":\"mock-ca\",\"order\":\"O1\",\"digestAlgorithm\":\"SM3\",\"digest\":\"" + Base64.getEncoder().encodeToString(digest) + "\"}";
        var verification = adapter.verification();
        assertThat(verification.envelopeBinds(envelope, "SM3", digest)).isTrue();
        assertThat(verification.envelopeBinds(envelope, "SM3", new byte[32])).isFalse();
        assertThat(verification.envelopeBinds(envelope, "SHA-256", digest)).isFalse();
        assertThat(verification.envelopeBinds(envelope.replace("mock-ca", "other"), "SM3", digest)).isFalse();
        assertThat(verification.envelopeBinds("not json", "SM3", digest)).isFalse();
    }

    @Test
    void transportFailuresAreRetryableAndRejectionsAreNot() {
        var port = adapter.remoteSigning().orElseThrow();
        var ref = new RemoteOrderRef(1L, 2L, 1L, "O1");

        routes.put("signing/query", body -> new MockCaClient.Transport.Response(500, "{\"error\":\"boom\"}"));
        assertThatThrownBy(() -> port.query(ref)).isInstanceOfSatisfying(CaVendorCallException.class, e -> {
            assertThat(e.retryable()).isTrue(); assertThat(e.errorCode()).isEqualTo("CA_HTTP_500"); });

        routes.put("signing/query", body -> new MockCaClient.Transport.Response(401, "{}"));
        assertThatThrownBy(() -> port.query(ref)).isInstanceOfSatisfying(CaVendorCallException.class,
                e -> assertThat(e.retryable()).isTrue());

        routes.put("signing/query", body -> new MockCaClient.Transport.Response(200, "<html>oops</html>"));
        assertThatThrownBy(() -> port.query(ref)).isInstanceOfSatisfying(CaVendorCallException.class, e -> {
            assertThat(e.retryable()).isTrue(); assertThat(e.errorCode()).isEqualTo("CA_BAD_RESPONSE"); });

        routes.put("signing/query", body -> new MockCaClient.Transport.Response(200, "{\"data\":{}}"));
        assertThatThrownBy(() -> port.query(ref)).isInstanceOf(CaVendorCallException.class);

        routes.put("signing/query", body -> new MockCaClient.Transport.Response(200,
                "{\"code\":-1,\"errorCode\":\"CA_ORDER_NOT_FOUND\",\"message\":\"任务不存在\"}"));
        assertThatThrownBy(() -> port.query(ref)).isInstanceOfSatisfying(CaVendorCallException.class, e -> {
            assertThat(e.retryable()).isFalse(); assertThat(e.errorCode()).isEqualTo("CA_ORDER_NOT_FOUND"); });

        var timeouts = new MockCaVendorAdapter(properties(true), json, (uri, h, b, c, r) -> { throw new HttpTimeoutException("t"); }, Clock.systemUTC());
        assertThatThrownBy(() -> timeouts.remoteSigning().orElseThrow().query(ref)).isInstanceOfSatisfying(CaVendorCallException.class, e -> {
            assertThat(e.retryable()).isTrue(); assertThat(e.errorCode()).isEqualTo("CA_TIMEOUT"); });
        var network = new MockCaVendorAdapter(properties(true), json, (uri, h, b, c, r) -> { throw new IOException("refused " + SECRET); }, Clock.systemUTC());
        assertThatThrownBy(() -> network.remoteSigning().orElseThrow().query(ref))
                .isInstanceOf(CaVendorCallException.class).hasMessageNotContaining(SECRET);
        assertThatThrownBy(() -> adapter.remoteSigning().orElseThrow().query(new RemoteOrderRef(9L, 9L, 1L, "O")))
                .isInstanceOfSatisfying(CaVendorCallException.class, e -> assertThat(e.errorCode()).isEqualTo("CA_NOT_CONFIGURED"));
    }

    static final class MutableClock extends Clock {
        private Instant now;
        MutableClock(Instant now) { this.now = now; }
        void advance(Duration duration) { now = now.plus(duration); }
        @Override public java.time.ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(java.time.ZoneId zone) { return this; }
        @Override public Instant instant() { return now; }
    }
}
