package com.rhn.platform.security;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;

@Component
@ConditionalOnProperty(name = "rhn.security.session-registry", havingValue = "memory", matchIfMissing = true)
class InMemorySessionRevocationStore implements SessionRevocationStore {
    private final ConcurrentHashMap<Key, Instant> revocations = new ConcurrentHashMap<>();

    @Override
    public void revoke(Long tenantId, String clientSessionId, Duration ttl) {
        revocations.put(new Key(tenantId, clientSessionId), Instant.now().plus(ttl));
    }

    @Override
    public boolean isRevoked(Long tenantId, String clientSessionId) {
        Key key = new Key(tenantId, clientSessionId); Instant expiresAt = revocations.get(key);
        if (expiresAt == null) return false;
        if (expiresAt.isAfter(Instant.now())) return true;
        revocations.remove(key, expiresAt); return false;
    }

    private record Key(Long tenantId, String clientSessionId) {}
}
