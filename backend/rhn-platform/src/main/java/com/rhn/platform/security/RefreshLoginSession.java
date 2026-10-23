package com.rhn.platform.security;

import java.time.Instant;

/**
 * {@code authenticationMethod} records how the session was established (see {@link LoginMethods});
 * sessions stored before it existed read back as null and count as password-only.
 * {@code expiresAt} is the absolute lifetime limit; {@code lastAccessedAt} drives the idle timeout and reads back
 * as null for sessions stored before sliding renewal, which then count as last accessed at creation.
 */
public record RefreshLoginSession(Long tenantId, Long userId, String username,
                                  Instant createdAt, Instant expiresAt, String authenticationMethod,
                                  Instant lastAccessedAt) {
    public boolean multiFactor() {
        return LoginMethods.multiFactor(authenticationMethod);
    }

    Instant lastActivity() {
        return lastAccessedAt == null ? createdAt : lastAccessedAt;
    }

    RefreshLoginSession accessedAt(Instant time) {
        return new RefreshLoginSession(tenantId, userId, username, createdAt, expiresAt, authenticationMethod, time);
    }
}
