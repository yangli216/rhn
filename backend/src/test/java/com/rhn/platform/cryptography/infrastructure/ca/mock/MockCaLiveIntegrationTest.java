package com.rhn.platform.cryptography.infrastructure.ca.mock;

import com.rhn.platform.cryptography.api.SigningMode;
import com.rhn.platform.cryptography.application.CaProperties;
import com.rhn.platform.cryptography.infrastructure.SmCrypto;
import com.rhn.platform.cryptography.spi.CaMobileLoginPort;
import com.rhn.platform.cryptography.spi.CaRemoteSigningPort;
import com.rhn.platform.cryptography.spi.CaSignerEnrollmentPort;
import com.rhn.platform.cryptography.spi.SignatureFormat;
import com.rhn.shared.json.JsonCodec;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 与 rhn-thirdparty-mocks 真实联调（按需运行，默认跳过）：
 * {@code mvn test -Dtest=MockCaLiveIntegrationTest -Drhn.ca.mock.url=http://127.0.0.1:<port>}。
 * 实例须由调用方在非固定端口启动并自行关闭；用例只通过其管理端点复位和遥控。
 */
class MockCaLiveIntegrationTest {
    final JsonMapper mapper = JsonMapper.builder().build();
    final JsonCodec json = new JsonCodec() {
        @Override public String write(Object value) { return mapper.writeValueAsString(value); }
        @Override public JsonNode readTree(String value) { return mapper.readTree(value); }
        @Override public <T> T read(String value, Class<T> type) { return mapper.readValue(value, type); }
        @Override @SuppressWarnings("unchecked")
        public Map<String, Object> readObject(String value) { return mapper.readValue(value, java.util.LinkedHashMap.class); }
    };
    final HttpClient http = HttpClient.newHttpClient();
    String base;
    MockCaVendorAdapter adapter;

    @BeforeEach
    void connect() throws Exception {
        base = System.getProperty("rhn.ca.mock.url");
        Assumptions.assumeTrue(base != null && !base.isBlank(), "rhn.ca.mock.url 未设置，跳过真实联调");
        admin("POST", "/mock/reset", null);
        admin("PUT", "/mock/config?protocol=ca", "{\"autoConfirmOrders\":true,\"autoConfirmLoginSigner\":\"mock-7\"}");
        var connection = new CaProperties.Connection(1L, 2L, base + "/ca", "mock-ca-client", "mock-ca-secret",
                Duration.ofSeconds(3), Duration.ofSeconds(10));
        var properties = new CaProperties(true, "mock-ca", null, null, null, null, 8, false, 2000, 50, null, null,
                Map.of("mock-ca", new CaProperties.VendorSettings(true, List.of(connection))));
        adapter = new MockCaVendorAdapter(properties, json);
    }

    String admin(String method, String path, String body) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create(base + path)).header("Content-Type", "application/json");
        builder.method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body));
        return http.send(builder.build(), HttpResponse.BodyHandlers.ofString()).body();
    }

    @Test
    void enrollSignVerifyLocallyAndLogin() throws Exception {
        var enrolled = adapter.enrollment().orElseThrow().enroll(1L, 2L, new CaSignerEnrollmentPort.SignerProfile(
                7L, 70L, "张医生", "ID_CARD", "110101199001010011", "13800000000", "内科"));
        assertThat(enrolled.state()).isEqualTo(CaSignerEnrollmentPort.State.READY);
        assertThat(enrolled.externalSignerId()).isEqualTo("mock-7");
        var certificate = SmCrypto.certificate(enrolled.certificate());

        // 信任锚与本地链校验
        var anchors = adapter.verification().trustAnchors(1L, 2L);
        assertThat(anchors).hasSize(1);
        assertThat(SmCrypto.issuedBy(certificate, anchors.getFirst())).isTrue();
        assertThat(SmCrypto.allowsSigning(certificate)).isTrue();
        assertThat(SmCrypto.validAt(certificate, Instant.now())).isTrue();

        // 远程签名（PUSH + 自动确认）→ 取结果 → 本地验封装绑定、验签、验时间戳
        byte[] digest = SmCrypto.digest(SmCrypto.SM3, "门诊病历声明".getBytes(StandardCharsets.UTF_8));
        var port = adapter.remoteSigning().orElseThrow();
        var submitted = port.submit(new CaRemoteSigningPort.RemoteSigningRequest(1L, 2L, 1001L, "mock-7", SigningMode.PUSH,
                "OUTPATIENT_NOTE", "SM3", digest, "门诊病历", "张*", Instant.now().plus(Duration.ofHours(1))));
        var again = port.submit(new CaRemoteSigningPort.RemoteSigningRequest(1L, 2L, 1001L, "mock-7", SigningMode.PUSH,
                "OUTPATIENT_NOTE", "SM3", digest, "门诊病历", "张*", Instant.now().plus(Duration.ofHours(1))));
        assertThat(again.externalOrderId()).isEqualTo(submitted.externalOrderId());   // signingOrderId 幂等
        var ref = new CaRemoteSigningPort.RemoteOrderRef(1L, 2L, 1001L, submitted.externalOrderId());
        assertThat(port.query(ref).state()).isEqualTo(CaRemoteSigningPort.RemoteState.SIGNED);
        assertThat(port.queryBatch(List.of(ref)).getFirst().state()).isEqualTo(CaRemoteSigningPort.RemoteState.SIGNED);
        var signature = port.fetch(ref);
        assertThat(signature.format()).isEqualTo(SignatureFormat.SM2_ENVELOPE);
        assertThat(adapter.verification().envelopeBinds(signature.signedEnvelope(), "SM3", digest)).isTrue();
        assertThat(SmCrypto.verify(certificate.getPublicKey(), signature.signedEnvelope().getBytes(StandardCharsets.UTF_8),
                Base64.getDecoder().decode(signature.signatureValue()))).isTrue();
        assertThat(adapter.verification().verifyTimestamp(signature.timestampAuthority(), signature.timestampToken(),
                Base64.getDecoder().decode(signature.signatureValue()))).isPresent();

        // 单独取时间戳（UKey 路径）
        byte[] value = Base64.getDecoder().decode(signature.signatureValue());
        var stamp = adapter.timestamp().orElseThrow().stamp(1L, 2L, value);
        assertThat(adapter.verification().verifyTimestamp(stamp.authority(), stamp.token(), value)).isPresent();

        // 扫码登录（轮询时自动确认）
        var login = adapter.mobileLogin().orElseThrow();
        var challenge = login.start(1L, 2L, false, 0);
        var result = login.poll(1L, 2L, challenge.externalRequestId());
        assertThat(result.state()).isEqualTo(CaMobileLoginPort.State.CONFIRMED);
        assertThat(result.externalSignerId()).isEqualTo("mock-7");
        assertThat(SmCrypto.fingerprint(SmCrypto.certificate(result.certificate()))).isEqualTo(SmCrypto.fingerprint(certificate));

        // 取消与自动签授权
        var second = port.submit(new CaRemoteSigningPort.RemoteSigningRequest(1L, 2L, 1002L, "mock-7", SigningMode.QR_CLAIM,
                "OUTPATIENT_NOTE", "SM3", digest, "门诊病历", null, Instant.now().plus(Duration.ofHours(1))));
        assertThat(second.claimContent()).startsWith("mock-ca://claim/");
        var grants = adapter.signingGrant().orElseThrow();
        assertThat(grants.request(1L, 2L, "mock-7", Duration.ofHours(2)).qrContent()).startsWith("mock-ca://grant/");
        grants.revoke(1L, 2L, "mock-7");
        assertThat(grants.query(1L, 2L, "mock-7").name()).isEqualTo("NONE");
    }

    @Test
    void vendorFaultsSurfaceAsRetryableOrRejected() throws Exception {
        adapter.enrollment().orElseThrow().enroll(1L, 2L, new CaSignerEnrollmentPort.SignerProfile(
                8L, 80L, "李医生", "ID_CARD", "TEST-REVOKED", "13800000001", "外科"));
        var port = adapter.remoteSigning().orElseThrow();
        byte[] digest = new byte[32];
        assertThatThrownBy(() -> port.submit(new CaRemoteSigningPort.RemoteSigningRequest(1L, 2L, 2001L, "mock-8", SigningMode.PUSH,
                "S", "SM3", digest, "x", null, Instant.now().plusSeconds(600))))
                .isInstanceOfSatisfying(CaVendorCallException.class, e -> {
                    assertThat(e.retryable()).isFalse();
                    assertThat(e.errorCode()).isEqualTo("CA_CERTIFICATE_REVOKED"); });

        admin("PUT", "/mock/config?protocol=ca", "{\"fault\":\"HTTP500\",\"faultOp\":\"signing/query\"}");
        assertThatThrownBy(() -> port.query(new CaRemoteSigningPort.RemoteOrderRef(1L, 2L, 1L, "x")))
                .isInstanceOfSatisfying(CaVendorCallException.class, e -> assertThat(e.retryable()).isTrue());
        admin("PUT", "/mock/config?protocol=ca", "{\"fault\":\"BADJSON\",\"faultOp\":\"signing/query\"}");
        assertThatThrownBy(() -> port.query(new CaRemoteSigningPort.RemoteOrderRef(1L, 2L, 1L, "x")))
                .isInstanceOfSatisfying(CaVendorCallException.class, e -> assertThat(e.errorCode()).isEqualTo("CA_BAD_RESPONSE"));
        admin("PUT", "/mock/config?protocol=ca", "{\"fault\":\"SLOW\",\"faultOp\":\"signing/query\",\"slowDelayMs\":12000}");
        assertThatThrownBy(() -> port.query(new CaRemoteSigningPort.RemoteOrderRef(1L, 2L, 1L, "x")))
                .isInstanceOfSatisfying(CaVendorCallException.class, e -> assertThat(e.errorCode()).isEqualTo("CA_TIMEOUT"));
    }
}
