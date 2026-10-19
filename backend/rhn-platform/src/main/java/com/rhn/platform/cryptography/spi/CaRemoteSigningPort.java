package com.rhn.platform.cryptography.spi;

import com.rhn.platform.cryptography.api.SigningMode;

import java.time.Instant;
import java.util.List;

/**
 * Vendor-hosted signing orders (push, QR claim, auto-sign). Calls happen after the business transaction
 * commits; implementations must be idempotent on {@code signingOrderId} so a retried submit never creates
 * a second vendor order.
 */
public interface CaRemoteSigningPort {
    RemoteOrderStatus submit(RemoteSigningRequest request);

    RemoteOrderStatus query(RemoteOrderRef ref);

    default List<RemoteOrderStatus> queryBatch(List<RemoteOrderRef> refs) {
        return refs.stream().map(this::query).toList();
    }

    /** Only valid once the order is {@link RemoteState#SIGNED}. */
    RemoteSignature fetch(RemoteOrderRef ref);

    void cancel(RemoteOrderRef ref);

    /**
     * @param statementDigest digest the vendor signs; the statement itself is never sent
     * @param subject         short business label shown in the signer's app, without diagnoses
     * @param patientDisplay  already minimized patient label (for example a masked name) or null
     */
    record RemoteSigningRequest(Long tenantId, Long organizationId, Long signingOrderId, String externalSignerId,
                                SigningMode mode, String sceneCode, String digestAlgorithm, byte[] statementDigest,
                                String subject, String patientDisplay, Instant expiresAt) {
        public RemoteSigningRequest {
            statementDigest = statementDigest.clone();
        }

        @Override
        public byte[] statementDigest() {
            return statementDigest.clone();
        }
    }

    record RemoteOrderRef(Long tenantId, Long organizationId, Long signingOrderId, String externalOrderId) {}

    /** {@code claimContent} is QR payload for {@link SigningMode#QR_CLAIM}; never contains credentials. */
    record RemoteOrderStatus(String externalOrderId, RemoteState state, String claimContent, String message) {}

    enum RemoteState { AWAITING_SIGNER, SIGNED, REJECTED, EXPIRED, CANCELLED, VOIDED_BY_SIGNER, FAILED }

    /** {@code signatureValue} and {@code certificate} are Base64 (DER). */
    record RemoteSignature(SignatureFormat format, String signatureValue, String certificate, String signedEnvelope,
                           Instant signedAt, String timestampAuthority, String timestampToken) {}
}
