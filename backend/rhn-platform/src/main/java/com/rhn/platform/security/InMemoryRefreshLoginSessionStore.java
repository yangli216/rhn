package com.rhn.platform.security;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

@Component
@ConditionalOnProperty(name = "rhn.security.session-registry", havingValue = "memory", matchIfMissing = true)
class InMemoryRefreshLoginSessionStore implements RefreshLoginSessionStore {
    private final ConcurrentHashMap<Key, RefreshLoginSession> sessions = new ConcurrentHashMap<>();

    @Override
    public void save(String token, RefreshLoginSession session, Duration ttl) {
        sessions.put(new Key(session.tenantId(), token), session);
    }

    @Override
    public Optional<RefreshLoginSession> find(Long tenantId, String token) {
        Key key = new Key(tenantId, token);
        RefreshLoginSession session = sessions.get(key);
        if (session == null) return Optional.empty();
        if (session.expiresAt().isAfter(Instant.now())) return Optional.of(session);
        sessions.remove(key, session);
        return Optional.empty();
    }

    @Override
    public void delete(Long tenantId, String token) {
        sessions.remove(new Key(tenantId, token));
    }

    @Override
    public void deleteByUser(Long tenantId, Long userId) {
        sessions.entrySet().removeIf(entry -> tenantId.equals(entry.getKey().tenantId())
                && userId.equals(entry.getValue().userId()));
    }

    private record Key(Long tenantId, String token) {
    }
}
