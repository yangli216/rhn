package com.rhn.platform.cryptography.infrastructure.ca.development;

import com.rhn.platform.cryptography.api.SigningMode;
import com.rhn.platform.cryptography.infrastructure.SmCrypto;
import com.rhn.platform.cryptography.spi.CaRemoteSigningPort;
import com.rhn.platform.cryptography.spi.CaSignerEnrollmentPort;
import com.rhn.platform.cryptography.spi.CaSigningGrantPort;
import com.rhn.platform.cryptography.spi.CaTimestampPort;
import com.rhn.platform.cryptography.spi.CaVendorAdapter;
import com.rhn.platform.cryptography.spi.CaVerificationPort;
import com.rhn.platform.cryptography.spi.ProviderAssurance;
import com.rhn.platform.cryptography.spi.SignatureFormat;
import com.rhn.shared.id.GlobalIds;
import com.rhn.shared.json.JsonCodec;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.MessageDigest;
import java.security.cert.X509Certificate;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * In-process simulated CA for local development and automated tests. Keys live in memory only and the
 * adapter declares {@link ProviderAssurance#DEVELOPMENT_ONLY}, so the registry refuses it whenever
 * compliance enforcement is on. It mimics a hash-signing vendor: remote orders carry only the statement
 * digest and the signer signs a vendor envelope that embeds it.
 */
@Component
@ConditionalOnProperty(prefix = "rhn.crypto.ca.development", name = "enabled", havingValue = "true")
public class DevelopmentCaAdapter implements CaVendorAdapter {
    public static final String CODE = "development-ca";
    private static final String TSA = "rhn-development-tsa";
    private static final String ORGANIZATION = "O=RHN DEVELOPMENT ONLY";
    private static final String ROOT_DN = "CN=RHN Development CA," + ORGANIZATION;

    private final JsonCodec jsonCodec;
    private final KeyPair rootKeys = SmCrypto.generateKeyPair();
    private final X509Certificate root;
    private final KeyPair timestampKeys = SmCrypto.generateKeyPair();
    private final Map<String, SignerKey> signers = new ConcurrentHashMap<>();
    private final Map<String, Instant> grants = new ConcurrentHashMap<>();
    private final Map<String, DevelopmentOrder> orders = new ConcurrentHashMap<>();
    private final Map<Long, String> ordersBySigningOrder = new ConcurrentHashMap<>();

    public DevelopmentCaAdapter(JsonCodec jsonCodec) {
        this.jsonCodec = jsonCodec;
        Instant now = Instant.now().truncatedTo(ChronoUnit.SECONDS);
        this.root = SmCrypto.issue(ROOT_DN, rootKeys.getPublic(), ROOT_DN, rootKeys.getPrivate(),
                now.minus(1, ChronoUnit.DAYS),
                now.plus(3650, ChronoUnit.DAYS), true);
    }

    @Override
    public String vendorCode() {
        return CODE;
    }

    @Override
    public Capabilities capabilities() {
        return new Capabilities(ProviderAssurance.DEVELOPMENT_ONLY,
                Set.of(SigningMode.PUSH, SigningMode.QR_CLAIM, SigningMode.AUTO, SigningMode.CLIENT_TOKEN),
                Set.of(SignatureFormat.SM2_STATEMENT, SignatureFormat.SM2_ENVELOPE), 100);
    }

    @Override
    public CaVerificationPort verification() {
        return verification;
    }

    @Override
    public Optional<CaTimestampPort> timestamp() {
        return Optional.of((tenantId, organizationId, signatureValue) -> stamp(signatureValue));
    }

    @Override
    public Optional<CaSignerEnrollmentPort> enrollment() {
        return Optional.of(enrollment);
    }

    @Override
    public Optional<CaRemoteSigningPort> remoteSigning() {
        return Optional.of(remoteSigning);
    }

    @Override
    public Optional<CaSigningGrantPort> signingGrant() {
        return Optional.of(signingGrant);
    }

    /** Issues (or re-issues after a restart) the simulated certificate of an account. */
    public Issued issue(Long userId, String name) {
        String externalSignerId = "dev-" + userId;
        SignerKey key = signers.computeIfAbsent(externalSignerId, id -> newSigner(userId, name));
        return new Issued(externalSignerId, base64(SmCrypto.encoded(key.certificate())));
    }

    /** Simulates the UKey middleware: SM3withSM2 over the bytes the browser was asked to sign. */
    public ClientSigned signLocally(String externalSignerId, byte[] toBeSigned) {
        SignerKey key = requireSigner(externalSignerId);
        return new ClientSigned(base64(SmCrypto.sign(key.keys().getPrivate(), toBeSigned)),
                base64(SmCrypto.encoded(key.certificate())));
    }

    /** Simulates the signer confirming (or claiming, for QR orders) a remote order in the phone app. */
    public void confirm(Long signingOrderId, String externalSignerId) {
        DevelopmentOrder order = requireOrder(signingOrderId);
        if (order.externalSignerId() != null && !order.externalSignerId().equals(externalSignerId)) {
            throw new IllegalStateException("Order belongs to another signer");
        }
        orders.put(order.externalOrderId(), sign(order, externalSignerId));
    }

    public void reject(Long signingOrderId) {
        DevelopmentOrder order = requireOrder(signingOrderId);
        orders.put(order.externalOrderId(), order.with(CaRemoteSigningPort.RemoteState.REJECTED));
    }

    public void grant(String externalSignerId, Duration duration) {
        requireSigner(externalSignerId);
        grants.put(externalSignerId, Instant.now().plus(duration));
    }

    private final CaVerificationPort verification = new CaVerificationPort() {
        @Override
        public List<X509Certificate> trustAnchors(Long tenantId, Long organizationId) {
            return List.of(root);
        }

        @Override
        public boolean envelopeBinds(String envelope, String digestAlgorithm, byte[] statementDigest) {
            try {
                var node = jsonCodec.readTree(envelope);
                return CODE.equals(node.get("vendor").asString())
                        && digestAlgorithm.equalsIgnoreCase(node.get("digestAlgorithm").asString())
                        && MessageDigest.isEqual(statementDigest, Base64.getDecoder().decode(node.get("digest").asString()));
            } catch (RuntimeException exception) {
                return false;
            }
        }

        @Override
        public Optional<Instant> verifyTimestamp(String authority, String token, byte[] signatureValue) {
            try {
                if (!TSA.equals(authority)) return Optional.empty();
                String[] parts = token.split("\\.");
                byte[] payload = Base64.getDecoder().decode(parts[0]);
                if (!SmCrypto.verify(timestampKeys.getPublic(), payload, Base64.getDecoder().decode(parts[1]))) {
                    return Optional.empty();
                }
                var node = jsonCodec.readTree(new String(payload, StandardCharsets.UTF_8));
                if (!MessageDigest.isEqual(SmCrypto.digest(SmCrypto.SM3, signatureValue),
                        Base64.getDecoder().decode(node.get("digest").asString()))) {
                    return Optional.empty();
                }
                return Optional.of(Instant.parse(node.get("time").asString()));
            } catch (RuntimeException exception) {
                return Optional.empty();
            }
        }
    };

    private final CaSignerEnrollmentPort enrollment = new CaSignerEnrollmentPort() {
        @Override
        public Enrollment enroll(Long tenantId, Long organizationId, SignerProfile profile) {
            Issued issued = issue(profile.userId(), profile.name());
            return new Enrollment(issued.externalSignerId(), State.READY, issued.certificate(),
                    signers.get(issued.externalSignerId()).certificate().getNotAfter().toInstant(), null);
        }

        @Override
        public Enrollment query(Long tenantId, Long organizationId, String externalSignerId) {
            SignerKey key = signers.get(externalSignerId);
            if (key == null) return new Enrollment(externalSignerId, State.DISABLED, null, null, "未签发");
            return new Enrollment(externalSignerId, State.READY, base64(SmCrypto.encoded(key.certificate())),
                    key.certificate().getNotAfter().toInstant(), null);
        }
    };

    private final CaRemoteSigningPort remoteSigning = new CaRemoteSigningPort() {
        @Override
        public RemoteOrderStatus submit(RemoteSigningRequest request) {
            String existing = ordersBySigningOrder.get(request.signingOrderId());
            if (existing != null) return status(orders.get(existing));
            String externalOrderId = "dev-order-" + GlobalIds.next();
            DevelopmentOrder order = new DevelopmentOrder(externalOrderId, request.signingOrderId(),
                    request.mode() == SigningMode.QR_CLAIM ? null : request.externalSignerId(), request.mode(),
                    request.digestAlgorithm(), base64(request.statementDigest()),
                    CaRemoteSigningPort.RemoteState.AWAITING_SIGNER, null, null, null, null);
            if (request.mode() == SigningMode.AUTO && granted(request.externalSignerId())) {
                order = sign(order, request.externalSignerId());
            }
            orders.put(externalOrderId, order);
            ordersBySigningOrder.put(request.signingOrderId(), externalOrderId);
            return status(order);
        }

        @Override
        public RemoteOrderStatus query(RemoteOrderRef ref) {
            DevelopmentOrder order = orders.get(ref.externalOrderId());
            if (order == null) return new RemoteOrderStatus(ref.externalOrderId(), RemoteState.FAILED, null, "未知任务");
            return status(order);
        }

        @Override
        public RemoteSignature fetch(RemoteOrderRef ref) {
            DevelopmentOrder order = orders.get(ref.externalOrderId());
            if (order == null || order.state() != RemoteState.SIGNED) {
                throw new IllegalStateException("Development order is not signed");
            }
            CaTimestampPort.Timestamp stamp = stamp(Base64.getDecoder().decode(order.signatureValue()));
            return new RemoteSignature(SignatureFormat.SM2_ENVELOPE, order.signatureValue(), order.certificate(),
                    order.envelope(), order.signedAt(), stamp.authority(), stamp.token());
        }

        @Override
        public void cancel(RemoteOrderRef ref) {
            orders.computeIfPresent(ref.externalOrderId(), (id, order) -> order.state() == RemoteState.AWAITING_SIGNER
                    ? order.with(RemoteState.CANCELLED) : order);
        }

        private RemoteOrderStatus status(DevelopmentOrder order) {
            return new RemoteOrderStatus(order.externalOrderId(), order.state(),
                    order.mode() == SigningMode.QR_CLAIM && order.state() == RemoteState.AWAITING_SIGNER
                            ? "rhn-dev-ca://claim/" + order.externalOrderId() : null, null);
        }
    };

    private final CaSigningGrantPort signingGrant = new CaSigningGrantPort() {
        @Override
        public GrantChallenge request(Long tenantId, Long organizationId, String externalSignerId, Duration duration) {
            return new GrantChallenge("rhn-dev-ca://grant/" + externalSignerId, Instant.now().plusSeconds(120));
        }

        @Override
        public GrantState query(Long tenantId, Long organizationId, String externalSignerId) {
            return granted(externalSignerId) ? GrantState.GRANTED : GrantState.NONE;
        }

        @Override
        public void revoke(Long tenantId, Long organizationId, String externalSignerId) {
            grants.remove(externalSignerId);
        }
    };

    private DevelopmentOrder sign(DevelopmentOrder order, String externalSignerId) {
        SignerKey key = requireSigner(externalSignerId);
        Map<String, String> envelope = new LinkedHashMap<>();
        envelope.put("vendor", CODE);
        envelope.put("order", order.externalOrderId());
        envelope.put("digestAlgorithm", order.digestAlgorithm());
        envelope.put("digest", order.digest());
        String envelopeJson = jsonCodec.write(envelope);
        String signature = base64(SmCrypto.sign(key.keys().getPrivate(), envelopeJson.getBytes(StandardCharsets.UTF_8)));
        return new DevelopmentOrder(order.externalOrderId(), order.signingOrderId(), externalSignerId, order.mode(),
                order.digestAlgorithm(), order.digest(), CaRemoteSigningPort.RemoteState.SIGNED, envelopeJson,
                signature, base64(SmCrypto.encoded(key.certificate())), Instant.now());
    }

    private CaTimestampPort.Timestamp stamp(byte[] signatureValue) {
        Instant time = Instant.now();
        Map<String, String> payload = new LinkedHashMap<>();
        payload.put("authority", TSA);
        payload.put("time", time.toString());
        payload.put("digest", base64(SmCrypto.digest(SmCrypto.SM3, signatureValue)));
        byte[] bytes = jsonCodec.write(payload).getBytes(StandardCharsets.UTF_8);
        String token = base64(bytes) + "." + base64(SmCrypto.sign(timestampKeys.getPrivate(), bytes));
        return new CaTimestampPort.Timestamp(TSA, token, time);
    }

    private boolean granted(String externalSignerId) {
        Instant until = externalSignerId == null ? null : grants.get(externalSignerId);
        return until != null && until.isAfter(Instant.now());
    }

    private SignerKey newSigner(Long userId, String name) {
        KeyPair keys = SmCrypto.generateKeyPair();
        Instant now = Instant.now().truncatedTo(ChronoUnit.SECONDS);
        String commonName = name == null || name.isBlank() ? "user-" + userId : name.replaceAll("[,=+<>#;\"\\\\]", "");
        X509Certificate certificate = SmCrypto.issue("CN=" + commonName + ",OU=" + userId + "," + ORGANIZATION,
                keys.getPublic(), ROOT_DN, rootKeys.getPrivate(),
                now.minus(1, ChronoUnit.HOURS), now.plus(365, ChronoUnit.DAYS), false);
        return new SignerKey(keys, certificate);
    }

    private SignerKey requireSigner(String externalSignerId) {
        SignerKey key = externalSignerId == null ? null : signers.get(externalSignerId);
        if (key == null) throw new IllegalStateException("Development signer is not issued: " + externalSignerId);
        return key;
    }

    private DevelopmentOrder requireOrder(Long signingOrderId) {
        String externalOrderId = ordersBySigningOrder.get(signingOrderId);
        DevelopmentOrder order = externalOrderId == null ? null : orders.get(externalOrderId);
        if (order == null || order.state() != CaRemoteSigningPort.RemoteState.AWAITING_SIGNER) {
            throw new IllegalStateException("No pending development order for signing order " + signingOrderId);
        }
        return order;
    }

    private static String base64(byte[] value) {
        return Base64.getEncoder().encodeToString(value);
    }

    public record Issued(String externalSignerId, String certificate) {}

    public record ClientSigned(String signatureValue, String certificate) {}

    private record SignerKey(KeyPair keys, X509Certificate certificate) {}

    private record DevelopmentOrder(String externalOrderId, Long signingOrderId, String externalSignerId,
                                    SigningMode mode, String digestAlgorithm, String digest,
                                    CaRemoteSigningPort.RemoteState state, String envelope, String signatureValue,
                                    String certificate, Instant signedAt) {
        DevelopmentOrder with(CaRemoteSigningPort.RemoteState next) {
            return new DevelopmentOrder(externalOrderId, signingOrderId, externalSignerId, mode, digestAlgorithm,
                    digest, next, envelope, signatureValue, certificate, signedAt);
        }
    }
}
