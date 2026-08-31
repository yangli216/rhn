package com.rhn.platform.security;

import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class RedisSessionRevocationStoreTest {
    @Test
    void stores_revocation_with_tenant_hash_slot_and_configured_ttl() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        @SuppressWarnings("unchecked")
        ValueOperations<String, String> values = mock(ValueOperations.class);
        when(redis.opsForValue()).thenReturn(values);
        RedisSessionRevocationStore store = new RedisSessionRevocationStore(redis, "rhn:sessions::");
        Duration ttl = Duration.ofHours(12);

        store.revoke(10L, "session-123", ttl);
        when(redis.hasKey("rhn:sessions:{10}:revoked:session-123")).thenReturn(true);

        verify(values).set("rhn:sessions:{10}:revoked:session-123", "REVOKED", ttl);
        assertThat(store.isRevoked(10L, "session-123")).isTrue();
    }
}
