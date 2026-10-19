package com.rhn.platform.cryptography.application;

import com.rhn.platform.cryptography.api.CaLoginService;
import com.rhn.platform.cryptography.api.SigningMode;
import com.rhn.platform.cryptography.domain.CaSigner;
import com.rhn.platform.cryptography.domain.CaSignerStatus;
import com.rhn.platform.cryptography.infrastructure.CaLoginChallengeStore;
import com.rhn.platform.cryptography.infrastructure.CaLoginChallengeStore.Challenge;
import com.rhn.platform.cryptography.infrastructure.CaSignerRepository;
import com.rhn.platform.cryptography.infrastructure.SmCrypto;
import com.rhn.platform.cryptography.spi.CaMobileLoginPort;
import com.rhn.platform.cryptography.spi.CaVendorAdapter;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.List;
import java.util.Optional;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;

/**
 * Resolves CA login proofs to bound accounts. The mobile result comes from the vendor over the
 * adapter's authenticated server-to-server channel; a UKey proof is verified locally against the
 * binding vendor's trust anchors. Neither path creates accounts or bindings.
 */
@Service
public class DefaultCaLoginService implements CaLoginService {
    static final Duration CHALLENGE_TTL = Duration.ofSeconds(120);
    static final String MOBILE = "MOBILE";
    static final String CERTIFICATE = "CERTIFICATE";
    private static final int POLL_INTERVAL_SECONDS = 2;
    private static final String CHALLENGE_PREFIX = "RHN-CA-LOGIN-1";

    private final CaVendorRegistry registry;
    private final CaSignerRepository signers;
    private final CaLoginChallengeStore challenges;
    private final SecureRandom random = new SecureRandom();

    public DefaultCaLoginService(CaVendorRegistry registry, CaSignerRepository signers,
                                 CaLoginChallengeStore challenges) {
        this.registry = registry;
        this.signers = signers;
        this.challenges = challenges;
    }

    @Override
    public Methods methods(Long tenantId) {
        return registry.forOrganization(tenantId, null)
                .map(adapter -> new Methods(adapter.mobileLogin().isPresent(),
                        adapter.capabilities().signingModes().contains(SigningMode.CLIENT_TOKEN), adapter.vendorCode()))
                .filter(value -> value.mobile() || value.certificate())
                .orElse(Methods.NONE);
    }

    @Override
    public MobileChallenge startMobile(Long tenantId, String browserNonce) {
        CaVendorAdapter adapter = registry.forOrganization(tenantId, null)
                .filter(value -> value.mobileLogin().isPresent())
                .orElseThrow(() -> conflict("CA_LOGIN_UNAVAILABLE", "当前租户未启用扫码登录"));
        CaMobileLoginPort.LoginChallenge started = adapter.mobileLogin().orElseThrow()
                .start(tenantId, null, false, 0);
        Instant expiresAt = earliest(started.expiresAt(), Instant.now().plus(CHALLENGE_TTL));
        String id = token();
        challenges.save(new Challenge(id, tenantId, MOBILE, adapter.vendorCode(), started.externalRequestId(),
                null, nonceHash(browserNonce), expiresAt), Duration.between(Instant.now(), expiresAt));
        return new MobileChallenge(id, started.qrContent(), expiresAt, POLL_INTERVAL_SECONDS);
    }

    @Override
    public Outcome pollMobile(Long tenantId, String loginRequestId, String browserNonce) {
        Optional<Challenge> found = owned(tenantId, loginRequestId, browserNonce, MOBILE);
        if (found.isEmpty()) return expired(MOBILE, null);
        Challenge challenge = found.get();
        Optional<CaMobileLoginPort> port = registry.byCode(challenge.vendorCode()).flatMap(CaVendorAdapter::mobileLogin);
        if (port.isEmpty()) {
            challenges.delete(tenantId, challenge.id());
            return Outcome.failed(State.FAILED, MOBILE, challenge.vendorCode(), null,
                    "CA_LOGIN_UNAVAILABLE", "扫码登录服务不可用");
        }
        CaMobileLoginPort.LoginResult result = port.get().poll(tenantId, null, challenge.externalRequestId());
        return switch (result.state()) {
            case PENDING -> Outcome.pending(MOBILE, challenge.vendorCode());
            case REJECTED -> {
                challenges.delete(tenantId, challenge.id());
                yield Outcome.failed(State.REJECTED, MOBILE, challenge.vendorCode(), result.externalSignerId(),
                        "CA_LOGIN_REJECTED", "已在手机端拒绝登录");
            }
            case EXPIRED -> {
                challenges.delete(tenantId, challenge.id());
                yield expired(MOBILE, challenge.vendorCode());
            }
            case CONFIRMED -> challenges.delete(tenantId, challenge.id())
                    ? confirmedMobile(tenantId, challenge.vendorCode(), result)
                    : expired(MOBILE, challenge.vendorCode());
        };
    }

    @Override
    public CertificateChallenge certificateChallenge(Long tenantId, String browserNonce) {
        CaVendorAdapter adapter = registry.forOrganization(tenantId, null)
                .filter(value -> value.capabilities().signingModes().contains(SigningMode.CLIENT_TOKEN))
                .orElseThrow(() -> conflict("CA_LOGIN_UNAVAILABLE", "当前租户未启用证书登录"));
        String id = token();
        Instant expiresAt = Instant.now().plus(CHALLENGE_TTL).truncatedTo(ChronoUnit.SECONDS);
        String toBeSigned = Base64.getEncoder().encodeToString((CHALLENGE_PREFIX + "\ntenant:" + tenantId
                + "\nchallenge:" + id + "\nnonce:" + token() + "\nexpires:" + expiresAt)
                .getBytes(StandardCharsets.UTF_8));
        challenges.save(new Challenge(id, tenantId, CERTIFICATE, adapter.vendorCode(), null, toBeSigned,
                nonceHash(browserNonce), expiresAt), CHALLENGE_TTL);
        return new CertificateChallenge(id, toBeSigned, expiresAt);
    }

    @Override
    public Outcome verifyCertificate(Long tenantId, String challengeId, String browserNonce,
                                     String signatureValue, String certificate) {
        Optional<Challenge> found = owned(tenantId, challengeId, browserNonce, CERTIFICATE);
        if (found.isEmpty() || !challenges.delete(tenantId, challengeId)) return expired(CERTIFICATE, null);
        Challenge challenge = found.get();
        X509Certificate presented;
        byte[] signature;
        try {
            presented = SmCrypto.certificate(certificate);
            signature = Base64.getDecoder().decode(signatureValue);
        } catch (IllegalArgumentException exception) {
            return certificateFailure(challenge, "CA_LOGIN_SIGNATURE_MALFORMED", "签名值或证书格式无效");
        }
        Instant now = Instant.now();
        List<CaSigner> bound = signers.findByTenantIdAndCertificateFingerprintAndStatus(
                tenantId, SmCrypto.fingerprint(presented), CaSignerStatus.ACTIVE).stream()
                .filter(value -> value.usableAt(now)).toList();
        if (bound.isEmpty()) {
            return certificateFailure(challenge, "CA_LOGIN_SIGNER_UNBOUND", "该证书尚未绑定本系统账号");
        }
        if (bound.stream().map(CaSigner::userId).distinct().count() > 1) {
            return certificateFailure(challenge, "CA_LOGIN_SIGNER_AMBIGUOUS", "该证书绑定了多个账号，请联系管理员");
        }
        CaSigner signer = bound.getFirst();
        Optional<CaVendorAdapter> adapter = registry.byCode(signer.vendorCode());
        if (adapter.isEmpty()) {
            return certificateFailure(challenge, "CA_LOGIN_UNAVAILABLE", "证书签发厂商适配器不可用");
        }
        List<X509Certificate> anchors = adapter.get().verification().trustAnchors(tenantId, null);
        if (anchors == null || anchors.stream().noneMatch(anchor -> SmCrypto.issuedBy(presented, anchor)
                && SmCrypto.validAt(anchor, now))) {
            return certificateFailure(challenge, "CA_CERTIFICATE_UNTRUSTED", "证书不是受信任 CA 签发");
        }
        if (!SmCrypto.validAt(presented, now)) {
            return certificateFailure(challenge, "CA_CERTIFICATE_EXPIRED", "证书不在有效期内");
        }
        if (!SmCrypto.allowsSigning(presented)) {
            return certificateFailure(challenge, "CA_CERTIFICATE_USAGE_INVALID", "证书不允许用于数字签名");
        }
        if (!SmCrypto.verify(presented.getPublicKey(), Base64.getDecoder().decode(challenge.toBeSigned()), signature)) {
            return certificateFailure(challenge, "CA_LOGIN_SIGNATURE_INVALID", "证书签名校验失败");
        }
        return new Outcome(State.CONFIRMED, CERTIFICATE, signer.vendorCode(), signer.userId(),
                signer.externalSignerId(), null, null);
    }

    private Outcome confirmedMobile(Long tenantId, String vendorCode, CaMobileLoginPort.LoginResult result) {
        String externalSignerId = result.externalSignerId();
        Optional<CaSigner> signer = externalSignerId == null ? Optional.empty()
                : signers.findByTenantIdAndVendorCodeAndExternalSignerId(tenantId, vendorCode, externalSignerId)
                .filter(value -> value.usableAt(Instant.now()));
        if (signer.isEmpty()) {
            return Outcome.failed(State.FAILED, MOBILE, vendorCode, externalSignerId,
                    "CA_LOGIN_SIGNER_UNBOUND", "该 CA 账号尚未绑定本系统账号");
        }
        if (result.certificate() != null && !result.certificate().isBlank()
                && signer.get().certificateFingerprint() != null
                && !signer.get().certificateFingerprint().equals(fingerprintOrNull(result.certificate()))) {
            return Outcome.failed(State.FAILED, MOBILE, vendorCode, externalSignerId,
                    "CA_LOGIN_CERTIFICATE_MISMATCH", "手机证书与绑定证书不一致，请联系管理员重新绑定");
        }
        return new Outcome(State.CONFIRMED, MOBILE, vendorCode, signer.get().userId(), externalSignerId, null, null);
    }

    private Optional<Challenge> owned(Long tenantId, String id, String browserNonce, String method) {
        if (id == null || id.isBlank() || id.length() > 64) return Optional.empty();
        String expected = nonceHash(browserNonce);
        return challenges.find(tenantId, id)
                .filter(value -> method.equals(value.method()))
                .filter(value -> MessageDigest.isEqual(expected.getBytes(StandardCharsets.US_ASCII),
                        value.nonceHash().getBytes(StandardCharsets.US_ASCII)));
    }

    private static Outcome certificateFailure(Challenge challenge, String code, String message) {
        return Outcome.failed(State.FAILED, CERTIFICATE, challenge.vendorCode(), null, code, message);
    }

    private static Outcome expired(String method, String vendorCode) {
        return Outcome.failed(State.EXPIRED, method, vendorCode, null, "CA_LOGIN_CHALLENGE_EXPIRED",
                "登录请求已失效，请重新发起");
    }

    private static String fingerprintOrNull(String certificate) {
        try {
            return SmCrypto.fingerprint(SmCrypto.certificate(certificate));
        } catch (IllegalArgumentException exception) {
            return null;
        }
    }

    private static String nonceHash(String browserNonce) {
        if (browserNonce == null || browserNonce.isBlank()) {
            throw badRequest("CA_LOGIN_BROWSER_REQUIRED", "登录请求缺少浏览器标识，请刷新页面后重试");
        }
        return SmCrypto.sm3Hex(browserNonce.getBytes(StandardCharsets.UTF_8));
    }

    private static Instant earliest(Instant vendor, Instant platform) {
        return vendor == null || vendor.isAfter(platform) ? platform : vendor;
    }

    private String token() {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
