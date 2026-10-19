package com.rhn.platform.cryptography.infrastructure;

import com.rhn.shared.json.JsonCodec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Optional;

@Component
@ConditionalOnProperty(name = "rhn.security.session-registry", havingValue = "redis")
class RedisCaLoginChallengeStore implements CaLoginChallengeStore {
    private final StringRedisTemplate redis;
    private final JsonCodec jsonCodec;
    private final String keyPrefix;

    RedisCaLoginChallengeStore(StringRedisTemplate redis, JsonCodec jsonCodec,
                               @Value("${rhn.security.ca-login.key-prefix:rhn:ca-login}") String keyPrefix) {
        this.redis = redis;
        this.jsonCodec = jsonCodec;
        this.keyPrefix = keyPrefix.replaceAll(":+$", "");
    }

    @Override
    public void save(Challenge challenge, Duration ttl) {
        redis.opsForValue().set(key(challenge.tenantId(), challenge.id()), jsonCodec.write(challenge), ttl);
    }

    @Override
    public Optional<Challenge> find(Long tenantId, String id) {
        String value = redis.opsForValue().get(key(tenantId, id));
        return value == null ? Optional.empty() : Optional.of(jsonCodec.read(value, Challenge.class));
    }

    @Override
    public boolean delete(Long tenantId, String id) {
        return Boolean.TRUE.equals(redis.delete(key(tenantId, id)));
    }

    private String key(Long tenantId, String id) {
        return keyPrefix + ":{" + tenantId + "}:challenge:" + id;
    }
}
