package com.rhn.platform.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;

@Component
@ConditionalOnProperty(name = "rhn.security.session-registry", havingValue = "redis")
class RedisSessionRevocationStore implements SessionRevocationStore {
    private final StringRedisTemplate redis;
    private final String keyPrefix;

    RedisSessionRevocationStore(StringRedisTemplate redis,
                                @Value("${rhn.security.session-key-prefix:rhn:sessions}") String keyPrefix) {
        this.redis = redis; this.keyPrefix = keyPrefix.replaceAll(":+$", "");
    }

    @Override
    public void revoke(Long tenantId, String clientSessionId, Duration ttl) {
        redis.opsForValue().set(key(tenantId, clientSessionId), "REVOKED", ttl);
    }

    @Override
    public boolean isRevoked(Long tenantId, String clientSessionId) {
        return Boolean.TRUE.equals(redis.hasKey(key(tenantId, clientSessionId)));
    }

    private String key(Long tenantId, String clientSessionId) {
        return keyPrefix + ":{" + tenantId + "}:revoked:" + clientSessionId;
    }
}
