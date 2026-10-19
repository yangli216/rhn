package com.rhn.platform.cryptography.application;

import com.rhn.platform.cryptography.api.CaSignerDirectory;
import com.rhn.platform.cryptography.api.PersonalSignatureViews.BindSigner;
import com.rhn.platform.cryptography.api.PersonalSignatureViews.SignerView;
import com.rhn.platform.cryptography.domain.CaSigner;
import com.rhn.platform.cryptography.domain.CaSignerMedium;
import com.rhn.platform.cryptography.domain.CaSignerStatus;
import com.rhn.platform.cryptography.domain.CertificateMaterial;
import com.rhn.platform.cryptography.infrastructure.CaSignerRepository;
import com.rhn.platform.cryptography.infrastructure.CertificateMaterialRepository;
import com.rhn.platform.cryptography.infrastructure.SmCrypto;
import com.rhn.platform.cryptography.spi.CaVendorAdapter;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.id.GlobalIds;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.cert.X509Certificate;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Locale;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class CaSignerService implements CaSignerDirectory {
    private final CaSignerRepository signers;
    private final CertificateMaterialRepository certificates;
    private final CaVendorRegistry registry;
    private final ExecutionContextProvider contextProvider;

    public CaSignerService(CaSignerRepository signers, CertificateMaterialRepository certificates,
                           CaVendorRegistry registry, ExecutionContextProvider contextProvider) {
        this.signers = signers;
        this.certificates = certificates;
        this.registry = registry;
        this.contextProvider = contextProvider;
    }

    @Override
    @Transactional(readOnly = true)
    public List<SignerView> mine() {
        ExecutionContext context = contextProvider.requireCurrent();
        return signers.findByTenantIdAndUserIdOrderByBoundAtDescIdDesc(context.tenantId(), context.subjectId())
                .stream().map(CaSignerService::view).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<SignerView> forUser(Long userId) {
        ExecutionContext context = contextProvider.requireCurrent();
        return signers.findByTenantIdAndUserIdOrderByBoundAtDescIdDesc(context.tenantId(), userId)
                .stream().map(CaSignerService::view).toList();
    }

    @Override
    @Transactional
    public SignerView bind(BindSigner command) {
        ExecutionContext context = contextProvider.requireCurrent();
        return view(bind(context, command.userId(), command.practitionerId(), command.vendorCode(),
                command.externalSignerId(), medium(command.medium()), command.certificate()));
    }

    /** Binding used by administrators and by vendor enrollment flows acting for the current account. */
    @Transactional
    public CaSigner bind(ExecutionContext context, Long userId, Long practitionerId, String vendorCode,
                         String externalSignerId, CaSignerMedium medium, String certificateBase64) {
        if (userId == null) throw badRequest("CA_SIGNER_USER_REQUIRED", "请指定绑定账号");
        if (externalSignerId == null || externalSignerId.isBlank() || externalSignerId.length() > 128) {
            throw badRequest("CA_SIGNER_EXTERNAL_ID_INVALID", "厂商签名人标识无效");
        }
        CaVendorAdapter adapter = registry.byCode(vendorCode)
                .orElseThrow(() -> badRequest("CA_VENDOR_UNKNOWN", "未配置该 CA 厂商"));
        Instant now = Instant.now();
        CaSigner signer = signers.findByTenantIdAndVendorCodeAndExternalSignerId(
                context.tenantId(), vendorCode, externalSignerId.trim()).orElse(null);
        if (signer != null && !signer.userId().equals(userId)) {
            throw conflict("CA_SIGNER_BOUND_TO_OTHER_USER", "该厂商签名人已绑定其他账号");
        }
        if (signer == null) {
            signer = new CaSigner(GlobalIds.next(), context.tenantId(), userId, practitionerId, vendorCode,
                    externalSignerId.trim(), medium, context.subjectId(), now);
        } else if (signer.status() != CaSignerStatus.ACTIVE) {
            signer.status(CaSignerStatus.ACTIVE, now);
        }
        if (certificateBase64 != null && !certificateBase64.isBlank()) {
            X509Certificate certificate = parse(certificateBase64);
            if (adapter.verification().trustAnchors(context.tenantId(), context.organizationId()).stream()
                    .noneMatch(anchor -> SmCrypto.issuedBy(certificate, anchor))) {
                throw badRequest("CA_CERTIFICATE_UNTRUSTED", "证书不是该 CA 厂商签发");
            }
            if (!SmCrypto.allowsSigning(certificate)) {
                throw badRequest("CA_CERTIFICATE_USAGE_INVALID", "证书不允许用于数字签名");
            }
            String fingerprint = SmCrypto.fingerprint(certificate);
            boolean usedByOther = signers.findByTenantIdAndVendorCodeAndCertificateFingerprintAndStatus(
                            context.tenantId(), vendorCode, fingerprint, CaSignerStatus.ACTIVE).stream()
                    .anyMatch(value -> !value.userId().equals(userId));
            if (usedByOther) throw conflict("CA_CERTIFICATE_BOUND_TO_OTHER_USER", "该证书已绑定其他账号");
            signer.certificate(material(context.tenantId(), vendorCode, certificate), now);
        }
        return signers.save(signer);
    }

    @Override
    @Transactional
    public SignerView changeStatus(Long signerId, long expectedRevision, String status) {
        ExecutionContext context = contextProvider.requireCurrent();
        CaSigner signer = signers.findByIdAndTenantId(signerId, context.tenantId())
                .orElseThrow(() -> notFound("CA_SIGNER_NOT_FOUND", "未找到 CA 签名人绑定"));
        if (signer.revision() != expectedRevision) {
            throw conflict("CA_SIGNER_REVISION_CONFLICT", "签名人绑定已被修改，请刷新后重试");
        }
        CaSignerStatus next;
        try {
            next = CaSignerStatus.valueOf(status == null ? "" : status.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException exception) {
            throw badRequest("CA_SIGNER_STATUS_INVALID", "签名人绑定状态无效");
        }
        signer.status(next, Instant.now());
        return view(signers.saveAndFlush(signer));
    }

    /** Active, currently valid bindings of the account at a vendor. */
    @Transactional(readOnly = true)
    public List<CaSigner> usable(Long tenantId, Long userId, String vendorCode, Instant at) {
        return signers.findByTenantIdAndUserIdAndVendorCodeAndStatusOrderByBoundAtDescIdDesc(
                tenantId, userId, vendorCode, CaSignerStatus.ACTIVE).stream()
                .filter(value -> value.usableAt(at)).toList();
    }

    /** Stores a certificate once per tenant and fingerprint; later calls return the stored row. */
    @Transactional
    public CertificateMaterial material(Long tenantId, String vendorCode, X509Certificate certificate) {
        String fingerprint = SmCrypto.fingerprint(certificate);
        return certificates.findByTenantIdAndFingerprint(tenantId, fingerprint).orElseGet(() ->
                certificates.save(new CertificateMaterial(GlobalIds.next(), tenantId, fingerprint, vendorCode,
                        certificate.getSerialNumber().toString(16).toUpperCase(Locale.ROOT),
                        certificate.getIssuerX500Principal().getName(),
                        certificate.getSubjectX500Principal().getName(),
                        certificate.getNotBefore().toInstant(), certificate.getNotAfter().toInstant(),
                        Base64.getEncoder().encodeToString(SmCrypto.encoded(certificate)), Instant.now())));
    }

    static SignerView view(CaSigner signer) {
        return new SignerView(signer.id(), signer.userId(), signer.practitionerId(), signer.vendorCode(),
                signer.externalSignerId(), signer.medium().name(), signer.status().name(),
                signer.certificateFingerprint(), signer.certificateSerial(), signer.certificateIssuer(),
                signer.certificateSubject(), signer.certificateNotBefore(), signer.certificateNotAfter(),
                signer.boundAt(), signer.revision());
    }

    private static CaSignerMedium medium(String value) {
        try {
            return CaSignerMedium.valueOf(value == null ? "" : value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException exception) {
            throw badRequest("CA_SIGNER_MEDIUM_INVALID", "证书介质无效");
        }
    }

    private static X509Certificate parse(String certificate) {
        try {
            return SmCrypto.certificate(certificate);
        } catch (IllegalArgumentException exception) {
            throw badRequest("CA_CERTIFICATE_MALFORMED", "证书格式无效");
        }
    }
}
