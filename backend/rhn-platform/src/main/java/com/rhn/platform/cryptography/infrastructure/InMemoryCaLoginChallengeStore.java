package com.rhn.platform.cryptography.infrastructure;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

@Component
@ConditionalOnProperty(name = "rhn.security.session-registry", havingValue = "memory", matchIfMissing = true)
class InMemoryCaLoginChallengeStore implements CaLoginChallengeStore {
    private final ConcurrentHashMap<Key, Challenge> challenges = new ConcurrentHashMap<>();

    @Override
    public void save(Challenge challenge, Duration ttl) {
        Instant now = Instant.now();
        challenges.values().removeIf(value -> !value.expiresAt().isAfter(now));
        challenges.put(new Key(challenge.tenantId(), challenge.id()), challenge);
    }

    @Override
    public Optional<Challenge> find(Long tenantId, String id) {
        Challenge challenge = challenges.get(new Key(tenantId, id));
        return challenge == null || !challenge.expiresAt().isAfter(Instant.now())
                ? Optional.empty() : Optional.of(challenge);
    }

    @Override
    public boolean delete(Long tenantId, String id) {
        return challenges.remove(new Key(tenantId, id)) != null;
    }

    private record Key(Long tenantId, String id) {
    }
}
