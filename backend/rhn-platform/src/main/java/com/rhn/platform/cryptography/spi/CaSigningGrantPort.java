package com.rhn.platform.cryptography.spi;

import java.time.Duration;
import java.time.Instant;

/** Signer-approved auto-sign sessions: orders submitted with {@code AUTO} are signed without interaction. */
public interface CaSigningGrantPort {
    GrantChallenge request(Long tenantId, Long organizationId, String externalSignerId, Duration duration);

    GrantState query(Long tenantId, Long organizationId, String externalSignerId);

    void revoke(Long tenantId, Long organizationId, String externalSignerId);

    record GrantChallenge(String qrContent, Instant expiresAt) {}

    enum GrantState { NONE, PENDING, GRANTED, REFUSED }
}
