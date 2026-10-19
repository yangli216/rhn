package com.rhn.platform.security;

import java.time.Instant;

/**
 * {@code authenticationMethod} records how the session was established (see {@link LoginMethods});
 * sessions stored before it existed read back as null and count as password-only.
 */
public record RefreshLoginSession(Long tenantId, Long userId, String username,
                                  Instant createdAt, Instant expiresAt, String authenticationMethod) {
    public boolean multiFactor() {
        return LoginMethods.multiFactor(authenticationMethod);
    }
}
