package com.rhn.platform.cryptography.spi;

import java.security.cert.X509Certificate;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

/** Trust material the platform needs to verify a vendor signature without trusting the vendor's verdict. */
public interface CaVerificationPort {
    /** Issuing CA certificates personal certificates must chain to directly. */
    List<X509Certificate> trustAnchors(Long tenantId, Long organizationId);

    /**
     * Proves that a vendor envelope (format {@link SignatureFormat#SM2_ENVELOPE}) embeds exactly this
     * statement digest. Adapters that never return envelopes keep the default refusal.
     */
    default boolean envelopeBinds(String envelope, String digestAlgorithm, byte[] statementDigest) {
        return false;
    }

    /**
     * Verifies a trusted timestamp over {@code signatureValue} and returns its time, or empty when the
     * token is malformed, untrusted or covers different data.
     */
    Optional<Instant> verifyTimestamp(String timestampAuthority, String timestampToken, byte[] signatureValue);
}
