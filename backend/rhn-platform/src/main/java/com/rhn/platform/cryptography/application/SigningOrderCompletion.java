package com.rhn.platform.cryptography.application;

import com.rhn.platform.cryptography.domain.CaSigner;
import com.rhn.platform.cryptography.domain.SigningOrder;
import com.rhn.platform.cryptography.spi.CaRemoteSigningPort;
import com.rhn.platform.cryptography.spi.CaTimestampPort;
import com.rhn.platform.cryptography.spi.CaVendorAdapter;
import com.rhn.platform.cryptography.spi.SignatureFormat;
import com.rhn.shared.api.BusinessException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.Optional;

/**
 * Turns a returned signature into evidence: timestamp if missing, verify locally, require the
 * certificate to be one of the signer's own active bindings, store the certificate, write evidence.
 * Any failure marks the order failed; it never propagates into business transactions.
 */
@Component
class SigningOrderCompletion {
    private static final Logger LOG = LoggerFactory.getLogger(SigningOrderCompletion.class);
    private final CaVendorRegistry registry;
    private final PersonalSignatureVerifier verifier;
    private final CaSignerService signers;
    private final DefaultCryptographicEvidenceService evidence;

    SigningOrderCompletion(CaVendorRegistry registry, PersonalSignatureVerifier verifier, CaSignerService signers,
                           DefaultCryptographicEvidenceService evidence) {
        this.registry = registry;
        this.verifier = verifier;
        this.signers = signers;
        this.evidence = evidence;
    }

    /** Must run inside a transaction holding the order lock. */
    void complete(SigningOrder order, SignatureFormat format, String signatureValue, String certificate,
                  String signedEnvelope, String timestampAuthority, String timestampToken) {
        Instant now = Instant.now();
        Optional<CaVendorAdapter> adapter = registry.byCode(order.vendorCode());
        if (adapter.isEmpty()) {
            order.fail("CA_VENDOR_UNAVAILABLE", "签名厂商适配器不可用", now);
            return;
        }
        try {
            if (blank(timestampToken) && adapter.get().timestamp().isPresent()) {
                CaTimestampPort.Timestamp stamp = adapter.get().timestamp().get().stamp(order.tenantId(),
                        order.organizationId(), Base64.getDecoder().decode(signatureValue));
                timestampAuthority = stamp.authority();
                timestampToken = stamp.token();
            }
            PersonalSignatureVerifier.Result verified = verifier.verifyIncoming(order.tenantId(),
                    order.organizationId(), order.vendorCode(), new PersonalSignatureVerifier.Incoming(format,
                            signatureValue, certificate, signedEnvelope, timestampAuthority, timestampToken,
                            order.statementJson().getBytes(StandardCharsets.UTF_8), order.statementDigestAlgorithm()));
            if (!verified.valid()) {
                order.fail(verified.code(), verified.message(), now);
                return;
            }
            CaSigner signer = signers.usable(order.tenantId(), order.userId(), order.vendorCode(), verified.signedAt())
                    .stream().filter(value -> verified.fingerprint().equals(value.certificateFingerprint()))
                    .findFirst().orElse(null);
            if (signer == null) {
                order.fail("CA_SIGNER_MISMATCH", "签名证书不属于签署人本人的有效绑定", now);
                return;
            }
            signers.material(order.tenantId(), order.vendorCode(), verified.certificate());
            evidence.recordPersonalSignature(order, verified, format, signatureValue, signedEnvelope,
                    timestampAuthority, timestampToken);
            order.bindSigner(signer.id());
            order.verified(now);
        } catch (BusinessException exception) {
            order.fail(exception.code(), exception.getMessage(), now);
        } catch (RuntimeException exception) {
            LOG.warn("Personal CA signature completion failed for order {}", order.id(), exception);
            order.fail("CA_SIGNATURE_COMPLETION_FAILED", "个人签名结果处理失败", now);
        }
    }

    /** Best-effort vendor cancel once the local cancellation/expiry has committed. */
    void cancelRemoteAfterCommit(SigningOrder order) {
        if (order.externalOrderId() == null) return;
        Optional<CaRemoteSigningPort> port = registry.byCode(order.vendorCode()).flatMap(CaVendorAdapter::remoteSigning);
        if (port.isEmpty()) return;
        CaRemoteSigningPort.RemoteOrderRef ref = new CaRemoteSigningPort.RemoteOrderRef(order.tenantId(),
                order.organizationId(), order.id(), order.externalOrderId());
        Runnable cancel = () -> {
            try {
                port.get().cancel(ref);
            } catch (RuntimeException exception) {
                LOG.warn("Vendor cancel failed for signing order {}", ref.signingOrderId());
            }
        };
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    cancel.run();
                }
            });
        } else {
            cancel.run();
        }
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }
}
