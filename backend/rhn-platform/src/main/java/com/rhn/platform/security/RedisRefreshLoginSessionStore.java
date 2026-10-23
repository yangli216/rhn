package com.rhn.platform.security;

import com.rhn.shared.json.JsonCodec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.TimeUnit;

@Component
@ConditionalOnProperty(name = "rhn.security.session-registry", havingValue = "redis")
class RedisRefreshLoginSessionStore implements RefreshLoginSessionStore {
    private static final RedisScript<Long> DELETE_IF_UNCHANGED = new DefaultRedisScript<>(
            "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end",
            Long.class);
    private final StringRedisTemplate redis;
    private final JsonCodec jsonCodec;
    private final String keyPrefix;

    RedisRefreshLoginSessionStore(StringRedisTemplate redis, JsonCodec jsonCodec,
                                  @Value("${rhn.security.refresh-login.key-prefix:rhn:login-sessions}") String keyPrefix) {
        this.redis = redis;
        this.jsonCodec = jsonCodec;
        this.keyPrefix = keyPrefix.replaceAll(":+$", "");
    }

    @Override
    public void save(String token, RefreshLoginSession session, Duration ttl) {
        redis.opsForValue().set(sessionKey(session.tenantId(), token), jsonCodec.write(session), ttl);
        String userKey = userKey(session.tenantId(), session.userId());
        redis.opsForSet().add(userKey, token);
        // The user index must outlive every session it lists, or a forced sign-out would miss the longer ones.
        Duration lifetime = Duration.between(Instant.now(), session.expiresAt());
        Long current = redis.getExpire(userKey, TimeUnit.SECONDS);
        if (current == null || current < lifetime.toSeconds()) redis.expire(userKey, lifetime);
    }

    @Override
    public boolean renew(String token, RefreshLoginSession session, Duration ttl) {
        return Boolean.TRUE.equals(redis.opsForValue()
                .setIfPresent(sessionKey(session.tenantId(), token), jsonCodec.write(session), ttl));
    }

    @Override
    public Optional<RefreshLoginSession> find(Long tenantId, String token) {
        String value = redis.opsForValue().get(sessionKey(tenantId, token));
        return value == null ? Optional.empty() : Optional.of(jsonCodec.read(value, RefreshLoginSession.class));
    }

    @Override
    public void delete(Long tenantId, String token) {
        Optional<RefreshLoginSession> session = find(tenantId, token);
        redis.delete(sessionKey(tenantId, token));
        session.ifPresent(value -> redis.opsForSet().remove(userKey(tenantId, value.userId()), token));
    }

    @Override
    public boolean deleteIfUnchanged(Long tenantId, String token, RefreshLoginSession expected) {
        Long removed = redis.execute(DELETE_IF_UNCHANGED, List.of(sessionKey(tenantId, token)),
                jsonCodec.write(expected));
        if (!Long.valueOf(1).equals(removed)) return false;
        redis.opsForSet().remove(userKey(tenantId, expected.userId()), token);
        return true;
    }

    @Override
    public void deleteByUser(Long tenantId, Long userId) {
        String userKey = userKey(tenantId, userId);
        Set<String> tokens = redis.opsForSet().members(userKey);
        if (tokens != null && !tokens.isEmpty()) {
            ArrayList<String> keys = new ArrayList<>(tokens.size());
            tokens.forEach(token -> keys.add(sessionKey(tenantId, token)));
            redis.delete(keys);
        }
        redis.delete(userKey);
    }

    private String sessionKey(Long tenantId, String token) {
        return keyPrefix + ":{" + tenantId + "}:session:" + token;
    }

    private String userKey(Long tenantId, Long userId) {
        return keyPrefix + ":{" + tenantId + "}:user:" + userId;
    }
}
