package com.rhn.platform.security;

import com.rhn.shared.json.JsonCodec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Optional;
import java.util.Set;

@Component
@ConditionalOnProperty(name = "rhn.security.session-registry", havingValue = "redis")
class RedisRefreshLoginSessionStore implements RefreshLoginSessionStore {
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
        redis.expire(userKey, ttl);
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
