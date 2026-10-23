package com.rhn.platform.cryptography.infrastructure.ca.mock;

import com.rhn.platform.cryptography.api.SigningMode;
import com.rhn.platform.cryptography.application.CaProperties;
import com.rhn.platform.cryptography.application.CaProperties.Connection;
import com.rhn.platform.cryptography.infrastructure.SmCrypto;
import com.rhn.platform.cryptography.spi.CaMobileLoginPort;
import com.rhn.platform.cryptography.spi.CaRemoteSigningPort;
import com.rhn.platform.cryptography.spi.CaSignerEnrollmentPort;
import com.rhn.platform.cryptography.spi.CaSigningGrantPort;
import com.rhn.platform.cryptography.spi.CaTimestampPort;
import com.rhn.platform.cryptography.spi.CaVendorAdapter;
import com.rhn.platform.cryptography.spi.CaVerificationPort;
import com.rhn.platform.cryptography.spi.ProviderAssurance;
import com.rhn.platform.cryptography.spi.SignatureFormat;
import com.rhn.shared.json.JsonCodec;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.cert.X509Certificate;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import static com.rhn.platform.cryptography.infrastructure.ca.mock.MockCaClient.text;

/**
 * HTTP adapter to the rhn-thirdparty-mocks CA protocol ({@code docs/ca-mock-protocol.md} there). It
 * implements every vendor port but verifies everything locally: trust anchors come from {@code trust/anchors}
 * (cached), timestamps are checked against the vendor's timestamp certificate and envelopes are parsed here,
 * so a vendor verdict is never trusted. The adapter declares {@link ProviderAssurance#DEVELOPMENT_ONLY}
 * because the vendor is a simulator: the registry refuses it while {@code rhn.crypto.enforce-compliance}
 * is on, and integration environments must turn that gate off explicitly. Enabled only by
 * {@code rhn.crypto.ca.vendors.mock-ca.enabled=true}.
 */
@Component
@ConditionalOnProperty(prefix = "rhn.crypto.ca.vendors.mock-ca", name = "enabled", havingValue = "true")
public class MockCaVendorAdapter implements CaVendorAdapter {
    public static final String CODE = "mock-ca";
    private static final String TSA = "mock-ca-tsa";
    private static final Duration ANCHOR_TTL = Duration.ofMinutes(5);
    private static final int BATCH_LIMIT = 100;

    private final CaProperties.VendorSettings settings;
    private final JsonCodec json;
    private final MockCaClient client;
    private final Clock clock;
    private final Map<Connection, Anchors> anchors = new ConcurrentHashMap<>();

    @org.springframework.beans.factory.annotation.Autowired
    public MockCaVendorAdapter(CaProperties properties, JsonCodec json) {
        this(properties, json, MockCaClient.jdkTransport(), Clock.systemUTC());
    }

    MockCaVendorAdapter(CaProperties properties, JsonCodec json, MockCaClient.Transport transport, Clock clock) {
        this.settings = properties.vendors().get(CODE);
        if (settings == null || !settings.enabled()) {
            throw new IllegalStateException("rhn.crypto.ca.vendors." + CODE + " is not configured");
        }
        this.json = json;
        this.client = new MockCaClient(json, transport);
        this.clock = clock;
    }

    @Override public String vendorCode() { return CODE; }

    @Override
    public Capabilities capabilities() {
        return new Capabilities(ProviderAssurance.DEVELOPMENT_ONLY,
                Set.of(SigningMode.PUSH, SigningMode.QR_CLAIM, SigningMode.AUTO, SigningMode.CLIENT_TOKEN),
                Set.of(SignatureFormat.SM2_ENVELOPE, SignatureFormat.SM2_STATEMENT), BATCH_LIMIT);
    }

    @Override
    public boolean configured(Long tenantId, Long organizationId) {
        return settings.connectionFor(tenantId, organizationId).isPresent();
    }

    @Override public CaVerificationPort verification() { return verification; }

    @Override public Optional<CaTimestampPort> timestamp() { return Optional.of(timestamp); }

    @Override public Optional<CaSignerEnrollmentPort> enrollment() { return Optional.of(enrollment); }

    @Override public Optional<CaRemoteSigningPort> remoteSigning() { return Optional.of(remoteSigning); }

    @Override public Optional<CaMobileLoginPort> mobileLogin() { return Optional.of(mobileLogin); }

    @Override public Optional<CaSigningGrantPort> signingGrant() { return Optional.of(signingGrant); }

    private Connection connection(Long tenantId, Long organizationId) {
        return settings.connectionFor(tenantId, organizationId).orElseThrow(() -> new CaVendorCallException(
                "CA_NOT_CONFIGURED", "组织未配置 CA 厂商连接", false, null));
    }

    private JsonNode call(Long tenantId, Long organizationId, String operation, Map<String, Object> request) {
        return client.call(connection(tenantId, organizationId), operation, request);
    }

    // ==================== 信任材料（本地验证，缓存 trust/anchors） ====================

    private record Anchors(List<X509Certificate> roots, X509Certificate timestampCertificate, Instant fetchedAt) {}

    private Anchors anchors(Connection connection) {
        Anchors cached = anchors.get(connection);
        if (cached != null && cached.fetchedAt().plus(ANCHOR_TTL).isAfter(clock.instant())) return cached;
        try {
            JsonNode data = client.call(connection, "trust/anchors", Map.of());
            List<X509Certificate> roots = new ArrayList<>();
            for (JsonNode node : data.path("certificates")) roots.add(SmCrypto.certificate(node.asString()));
            if (roots.isEmpty()) throw new CaVendorCallException("CA_BAD_RESPONSE", "CA 厂商未返回信任根", true, null);
            String tsa = text(data.path("timestampCertificate"));
            Anchors fresh = new Anchors(List.copyOf(roots), tsa == null ? null : SmCrypto.certificate(tsa), clock.instant());
            anchors.put(connection, fresh);
            return fresh;
        } catch (CaVendorCallException exception) {
            // A stale anchor set beats failing every verification while the vendor is briefly unreachable.
            if (cached != null && exception.retryable()) return cached;
            throw exception;
        }
    }

    private final CaVerificationPort verification = new CaVerificationPort() {
        @Override
        public List<X509Certificate> trustAnchors(Long tenantId, Long organizationId) {
            return anchors(connection(tenantId, organizationId)).roots();
        }

        @Override
        public boolean envelopeBinds(String envelope, String digestAlgorithm, byte[] statementDigest) {
            try {
                JsonNode node = json.readTree(envelope);
                return CODE.equals(text(node.path("vendor")))
                        && digestAlgorithm != null && digestAlgorithm.equalsIgnoreCase(text(node.path("digestAlgorithm")))
                        && MessageDigest.isEqual(statementDigest, Base64.getDecoder().decode(text(node.path("digest"))));
            } catch (RuntimeException exception) {
                return false;
            }
        }

        @Override
        public Optional<Instant> verifyTimestamp(String authority, String token, byte[] signatureValue) {
            if (!TSA.equals(authority) || token == null) return Optional.empty();
            for (Connection connection : settings.organizations()) {
                X509Certificate certificate;
                try {
                    certificate = anchors(connection).timestampCertificate();
                } catch (RuntimeException exception) {
                    continue;
                }
                if (certificate == null) continue;
                Optional<Instant> time = verifyToken(certificate, token, signatureValue);
                if (time.isPresent()) return time;
            }
            return Optional.empty();
        }
    };

    private Optional<Instant> verifyToken(X509Certificate certificate, String token, byte[] signatureValue) {
        try {
            String[] parts = token.split("\\.");
            if (parts.length != 2) return Optional.empty();
            byte[] payload = Base64.getDecoder().decode(parts[0]);
            if (!SmCrypto.verify(certificate.getPublicKey(), payload, Base64.getDecoder().decode(parts[1]))) {
                return Optional.empty();
            }
            JsonNode node = json.readTree(new String(payload, StandardCharsets.UTF_8));
            if (!TSA.equals(text(node.path("authority")))) return Optional.empty();
            if (!MessageDigest.isEqual(SmCrypto.digest(SmCrypto.SM3, signatureValue),
                    Base64.getDecoder().decode(text(node.path("digest"))))) {
                return Optional.empty();
            }
            return Optional.of(Instant.parse(text(node.path("time"))));
        } catch (RuntimeException exception) {
            return Optional.empty();
        }
    }

    private final CaTimestampPort timestamp = (tenantId, organizationId, signatureValue) -> {
        JsonNode data = call(tenantId, organizationId, "timestamp/stamp",
                Map.of("signatureValue", Base64.getEncoder().encodeToString(signatureValue)));
        return new CaTimestampPort.Timestamp(required(data, "authority"), required(data, "token"),
                Instant.parse(required(data, "time")));
    };

    // ==================== 签名人备案 ====================

    private final CaSignerEnrollmentPort enrollment = new CaSignerEnrollmentPort() {
        @Override
        public Enrollment enroll(Long tenantId, Long organizationId, SignerProfile profile) {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("userId", profile.userId());
            body.put("practitionerId", profile.practitionerId());
            body.put("name", profile.name());
            body.put("identityType", profile.identityType());
            body.put("identityNumber", profile.identityNumber());
            body.put("mobile", profile.mobile());
            body.put("department", profile.department());
            return enrollment(call(tenantId, organizationId, "signers/enroll", body));
        }

        @Override
        public Enrollment query(Long tenantId, Long organizationId, String externalSignerId) {
            return enrollment(call(tenantId, organizationId, "signers/query", Map.of("externalSignerId", externalSignerId)));
        }
    };

    private static CaSignerEnrollmentPort.Enrollment enrollment(JsonNode data) {
        return new CaSignerEnrollmentPort.Enrollment(required(data, "externalSignerId"),
                CaSignerEnrollmentPort.State.valueOf(required(data, "state")), text(data.path("certificate")),
                instant(data.path("certificateNotAfter")), text(data.path("message")));
    }

    // ==================== 扫码登录 ====================

    private final CaMobileLoginPort mobileLogin = new CaMobileLoginPort() {
        @Override
        public LoginChallenge start(Long tenantId, Long organizationId, boolean enableAutoSign, int autoSignHours) {
            JsonNode data = call(tenantId, organizationId, "login/mobile/start",
                    Map.of("enableAutoSign", enableAutoSign, "autoSignHours", autoSignHours));
            return new LoginChallenge(required(data, "externalRequestId"), required(data, "qrContent"),
                    Instant.parse(required(data, "expiresAt")));
        }

        @Override
        public LoginResult poll(Long tenantId, Long organizationId, String externalRequestId) {
            JsonNode data = call(tenantId, organizationId, "login/mobile/poll", Map.of("externalRequestId", externalRequestId));
            return new LoginResult(State.valueOf(required(data, "state")), text(data.path("externalSignerId")),
                    text(data.path("certificate")), data.path("autoSignGranted").asBoolean(false));
        }
    };

    // ==================== 远程签名任务 ====================

    private final CaRemoteSigningPort remoteSigning = new CaRemoteSigningPort() {
        @Override
        public RemoteOrderStatus submit(RemoteSigningRequest request) {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("signingOrderId", String.valueOf(request.signingOrderId()));
            body.put("mode", request.mode().name());
            body.put("externalSignerId", request.externalSignerId());
            body.put("digestAlgorithm", request.digestAlgorithm());
            body.put("statementDigest", Base64.getEncoder().encodeToString(request.statementDigest()));
            body.put("tenantId", request.tenantId());
            body.put("organizationId", request.organizationId());
            body.put("sceneCode", request.sceneCode());
            body.put("subject", request.subject());
            body.put("patientDisplay", request.patientDisplay());
            body.put("expiresAt", request.expiresAt() == null ? null : request.expiresAt().toString());
            return status(call(request.tenantId(), request.organizationId(), "signing/submit", body));
        }

        @Override
        public RemoteOrderStatus query(RemoteOrderRef ref) {
            return status(call(ref.tenantId(), ref.organizationId(), "signing/query",
                    Map.of("externalOrderId", ref.externalOrderId())));
        }

        @Override
        public List<RemoteOrderStatus> queryBatch(List<RemoteOrderRef> refs) {
            List<RemoteOrderStatus> result = new ArrayList<>(refs.size());
            for (int from = 0; from < refs.size(); from += BATCH_LIMIT) {
                List<RemoteOrderRef> chunk = refs.subList(from, Math.min(refs.size(), from + BATCH_LIMIT));
                RemoteOrderRef first = chunk.getFirst();
                // One call per scope: the connection is chosen by tenant/organization, so mixed chunks fall back to single queries.
                boolean sameScope = chunk.stream().allMatch(ref -> java.util.Objects.equals(ref.tenantId(), first.tenantId())
                        && java.util.Objects.equals(ref.organizationId(), first.organizationId()));
                if (!sameScope) {
                    chunk.forEach(ref -> result.add(query(ref)));
                    continue;
                }
                JsonNode data = call(first.tenantId(), first.organizationId(), "signing/query-batch",
                        Map.of("externalOrderIds", chunk.stream().map(RemoteOrderRef::externalOrderId).toList()));
                Map<String, RemoteOrderStatus> byId = new LinkedHashMap<>();
                for (JsonNode node : data.path("orders")) {
                    RemoteOrderStatus value = status(node);
                    byId.put(value.externalOrderId(), value);
                }
                for (RemoteOrderRef ref : chunk) {
                    RemoteOrderStatus value = byId.get(ref.externalOrderId());
                    if (value == null) throw new CaVendorCallException("CA_BAD_RESPONSE", "批量查询缺少任务 " + ref.externalOrderId(), true, null);
                    result.add(value);
                }
            }
            return result;
        }

        @Override
        public RemoteSignature fetch(RemoteOrderRef ref) {
            JsonNode data = call(ref.tenantId(), ref.organizationId(), "signing/fetch",
                    Map.of("externalOrderId", ref.externalOrderId()));
            return new RemoteSignature(SignatureFormat.valueOf(required(data, "format")), required(data, "signatureValue"),
                    required(data, "certificate"), text(data.path("signedEnvelope")), instant(data.path("signedAt")),
                    text(data.path("timestampAuthority")), text(data.path("timestampToken")));
        }

        @Override
        public void cancel(RemoteOrderRef ref) {
            call(ref.tenantId(), ref.organizationId(), "signing/cancel", Map.of("externalOrderId", ref.externalOrderId()));
        }
    };

    /** A failed order's vendor error code is folded into the message the platform records. */
    private static CaRemoteSigningPort.RemoteOrderStatus status(JsonNode data) {
        String message = text(data.path("message"));
        String errorCode = text(data.path("errorCode"));
        if (errorCode != null) message = errorCode + (message == null ? "" : "：" + message);
        return new CaRemoteSigningPort.RemoteOrderStatus(required(data, "externalOrderId"),
                CaRemoteSigningPort.RemoteState.valueOf(required(data, "state")), text(data.path("claimContent")), message);
    }

    // ==================== 自动签授权 ====================

    private final CaSigningGrantPort signingGrant = new CaSigningGrantPort() {
        @Override
        public GrantChallenge request(Long tenantId, Long organizationId, String externalSignerId, Duration duration) {
            JsonNode data = call(tenantId, organizationId, "grants/request",
                    Map.of("externalSignerId", externalSignerId, "durationSeconds", duration.toSeconds()));
            return new GrantChallenge(required(data, "qrContent"), Instant.parse(required(data, "expiresAt")));
        }

        @Override
        public GrantState query(Long tenantId, Long organizationId, String externalSignerId) {
            JsonNode data = call(tenantId, organizationId, "grants/query", Map.of("externalSignerId", externalSignerId));
            return GrantState.valueOf(required(data, "state"));
        }

        @Override
        public void revoke(Long tenantId, Long organizationId, String externalSignerId) {
            call(tenantId, organizationId, "grants/revoke", Map.of("externalSignerId", externalSignerId));
        }
    };

    private static String required(JsonNode node, String field) {
        String value = text(node.path(field));
        if (value == null) throw new CaVendorCallException("CA_BAD_RESPONSE", "CA 厂商回执缺少 " + field, true, null);
        return value;
    }

    private static Instant instant(JsonNode node) {
        String value = text(node);
        return value == null ? null : Instant.parse(value);
    }
}
