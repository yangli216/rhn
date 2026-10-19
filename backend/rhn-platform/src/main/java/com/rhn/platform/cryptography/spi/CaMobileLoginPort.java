package com.rhn.platform.cryptography.spi;

import java.time.Instant;

/** QR-code login confirmed in the signer's phone app (phase 1b consumer: platform.security). */
public interface CaMobileLoginPort {
    LoginChallenge start(Long tenantId, Long organizationId, boolean enableAutoSign, int autoSignHours);

    LoginResult poll(Long tenantId, Long organizationId, String externalRequestId);

    record LoginChallenge(String externalRequestId, String qrContent, Instant expiresAt) {}

    /** {@code certificate} is Base64 DER when the vendor returns it. */
    record LoginResult(State state, String externalSignerId, String certificate, boolean autoSignGranted) {}

    enum State { PENDING, CONFIRMED, REJECTED, EXPIRED }
}
