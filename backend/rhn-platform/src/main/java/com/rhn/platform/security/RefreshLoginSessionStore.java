package com.rhn.platform.security;

import java.time.Duration;
import java.util.Optional;

interface RefreshLoginSessionStore {
    void save(String token, RefreshLoginSession session, Duration ttl);

    Optional<RefreshLoginSession> find(Long tenantId, String token);

    void delete(Long tenantId, String token);

    void deleteByUser(Long tenantId, Long userId);
}
