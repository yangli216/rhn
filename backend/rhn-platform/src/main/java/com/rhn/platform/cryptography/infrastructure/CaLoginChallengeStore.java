package com.rhn.platform.cryptography.infrastructure;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

/** Short-lived CA login challenges; the backend follows {@code rhn.security.session-registry}. */
public interface CaLoginChallengeStore {
    void save(Challenge challenge, Duration ttl);

    Optional<Challenge> find(Long tenantId, String id);

    /** Returns true only for the caller that actually removed it, so a challenge is consumed once. */
    boolean delete(Long tenantId, String id);

    /**
     * {@code nonceHash} is the SM3 hex of the browser nonce; {@code toBeSigned} (Base64) is set for
     * certificate challenges and {@code externalRequestId} for mobile ones.
     */
    record Challenge(String id, Long tenantId, String method, String vendorCode, String externalRequestId,
                     String toBeSigned, String nonceHash, Instant expiresAt) {}
}
