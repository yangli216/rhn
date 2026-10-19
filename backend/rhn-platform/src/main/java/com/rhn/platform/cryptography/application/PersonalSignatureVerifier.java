package com.rhn.platform.cryptography.application;

import com.rhn.platform.cryptography.domain.CertificateMaterial;
import com.rhn.platform.cryptography.domain.CryptographicEvidence;
import com.rhn.platform.cryptography.infrastructure.CertificateMaterialRepository;
import com.rhn.platform.cryptography.infrastructure.SmCrypto;
import com.rhn.platform.cryptography.spi.CaVendorAdapter;
import com.rhn.platform.cryptography.spi.CaVerificationPort;
import com.rhn.platform.cryptography.spi.SignatureFormat;
import org.springframework.stereotype.Component;

import java.security.cert.X509Certificate;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Optional;

/**
 * Verifies personal CA signatures locally with BouncyCastle: certificate chain to the vendor's trust
 * anchors, validity at signing time, signing key usage, SM2 signature and trusted timestamp. Vendor
 * verification APIs may be used for cross-checks but are never the deciding authority.
 */
@Component
public class PersonalSignatureVerifier {
    private final CaVendorRegistry registry;
    private final CertificateMaterialRepository certificates;

    public PersonalSignatureVerifier(CaVendorRegistry registry, CertificateMaterialRepository certificates) {
        this.registry = registry;
        this.certificates = certificates;
    }

    public Result verifyIncoming(Long tenantId, Long organizationId, String vendorCode, Incoming signature) {
        Optional<CaVendorAdapter> adapter = registry.byCode(vendorCode);
        if (adapter.isEmpty()) return Result.failed("CA_VENDOR_UNAVAILABLE", "签名厂商适配器不可用");
        X509Certificate certificate;
        byte[] signatureValue;
        try {
            certificate = SmCrypto.certificate(signature.certificate());
            signatureValue = Base64.getDecoder().decode(signature.signatureValue());
        } catch (IllegalArgumentException exception) {
            return Result.failed("CA_SIGNATURE_MALFORMED", "签名值或证书格式无效");
        }
        CaVerificationPort verification = adapter.get().verification();
        Instant signedAt = Instant.now();
        if (hasText(signature.timestampToken())) {
            Optional<Instant> time = verification.verifyTimestamp(signature.timestampAuthority(),
                    signature.timestampToken(), signatureValue);
            if (time.isEmpty()) return Result.failed("CA_TIMESTAMP_INVALID", "可信时间戳校验失败");
            signedAt = time.get();
        }
        String failure = verify(verification, tenantId, organizationId, certificate, signedAt, signature.format(),
                signature.statement(), signature.statementDigestAlgorithm(), signatureValue, signature.signedEnvelope());
        if (failure != null) return Result.failed(failure, message(failure));
        return new Result(true, null, null, certificate, SmCrypto.fingerprint(certificate), signedAt);
    }

    /** Re-verifies a stored personal signature evidence; returns false when material or trust is gone. */
    public boolean verifyStored(CryptographicEvidence evidence, byte[] statement) {
        Optional<CaVendorAdapter> adapter = registry.byCode(evidence.providerCode());
        if (adapter.isEmpty() || evidence.signerCertificateFingerprint() == null) return false;
        Optional<CertificateMaterial> material = certificates.findByTenantIdAndFingerprint(
                evidence.tenantId(), evidence.signerCertificateFingerprint());
        if (material.isEmpty()) return false;
        try {
            X509Certificate certificate = SmCrypto.certificate(material.get().derBase64());
            if (!SmCrypto.fingerprint(certificate).equals(evidence.signerCertificateFingerprint())) return false;
            byte[] signatureValue = Base64.getDecoder().decode(evidence.signatureValue());
            CaVerificationPort verification = adapter.get().verification();
            if (hasText(evidence.timestampToken()) && verification.verifyTimestamp(evidence.timestampAuthority(),
                    evidence.timestampToken(), signatureValue).isEmpty()) {
                return false;
            }
            return verify(verification, evidence.tenantId(), null, certificate, evidence.signedAt(),
                    SignatureFormat.valueOf(evidence.signatureFormat()), statement,
                    evidence.statementDigestAlgorithm(), signatureValue, evidence.signedEnvelope()) == null;
        } catch (RuntimeException exception) {
            return false;
        }
    }

    private String verify(CaVerificationPort verification, Long tenantId, Long organizationId,
                          X509Certificate certificate, Instant signedAt, SignatureFormat format, byte[] statement,
                          String digestAlgorithm, byte[] signatureValue, String envelope) {
        List<X509Certificate> anchors = verification.trustAnchors(tenantId, organizationId);
        if (anchors == null || anchors.stream().noneMatch(anchor -> SmCrypto.issuedBy(certificate, anchor)
                && SmCrypto.validAt(anchor, signedAt))) {
            return "CA_CERTIFICATE_UNTRUSTED";
        }
        if (!SmCrypto.validAt(certificate, signedAt)) return "CA_CERTIFICATE_EXPIRED";
        if (!SmCrypto.allowsSigning(certificate)) return "CA_CERTIFICATE_USAGE_INVALID";
        boolean signatureValid = switch (format) {
            case SM2_STATEMENT -> SmCrypto.verify(certificate.getPublicKey(), statement, signatureValue);
            case SM2_ENVELOPE -> hasText(envelope)
                    && verification.envelopeBinds(envelope, digestAlgorithm, SmCrypto.digest(digestAlgorithm, statement))
                    && SmCrypto.verify(certificate.getPublicKey(), envelope.getBytes(java.nio.charset.StandardCharsets.UTF_8),
                    signatureValue);
        };
        return signatureValid ? null : "CA_SIGNATURE_INVALID";
    }

    private static String message(String code) {
        return switch (code) {
            case "CA_CERTIFICATE_UNTRUSTED" -> "签名证书不是受信任 CA 签发";
            case "CA_CERTIFICATE_EXPIRED" -> "签名证书在签名时间不在有效期内";
            case "CA_CERTIFICATE_USAGE_INVALID" -> "签名证书不允许用于数字签名";
            default -> "个人签名值校验失败";
        };
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    public record Incoming(SignatureFormat format, String signatureValue, String certificate, String signedEnvelope,
                           String timestampAuthority, String timestampToken, byte[] statement,
                           String statementDigestAlgorithm) {}

    public record Result(boolean valid, String code, String message, X509Certificate certificate,
                         String fingerprint, Instant signedAt) {
        static Result failed(String code, String message) {
            return new Result(false, code, message, null, null, null);
        }
    }
}
