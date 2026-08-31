package com.rhn.platform.security;

import java.time.Instant;

public record RefreshLoginSession(Long tenantId, Long userId, String username,
                                  Instant createdAt, Instant expiresAt) {
}
