package com.rhn.platform.configuration.infrastructure;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.rhn.platform.configuration.api.ConfigurationValue;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Optional;

@Component
public class ConfigurationValueCache {
    private final Cache<CacheKey, ConfigurationValue> cache;

    public ConfigurationValueCache(
            @Value("${rhn.configuration.cache.maximum-size:10000}") long maximumSize,
            @Value("${rhn.configuration.cache.maximum-ttl:PT5M}") Duration maximumTtl) {
        if (maximumSize < 1 || maximumTtl.isZero() || maximumTtl.isNegative()) {
            throw new IllegalArgumentException("Configuration cache limits must be positive");
        }
        cache = Caffeine.newBuilder()
                .maximumSize(maximumSize)
                .expireAfterWrite(maximumTtl)
                .recordStats()
                .build();
    }

    public Optional<ConfigurationValue> get(Long tenantId, Long userId, Long organizationId,
                                            Long departmentId, String productCode, String moduleCode,
                                            String environmentCode, String key) {
        return Optional.ofNullable(cache.getIfPresent(new CacheKey(tenantId, userId, organizationId,
                departmentId, productCode, moduleCode, environmentCode, key)));
    }

    public void put(Long tenantId, Long userId, Long organizationId, Long departmentId,
                    String productCode, String moduleCode, String environmentCode,
                    String key, ConfigurationValue value) {
        cache.put(new CacheKey(tenantId, userId, organizationId, departmentId,
                productCode, moduleCode, environmentCode, key), value);
    }

    public void invalidateAll() {
        cache.invalidateAll();
        cache.cleanUp();
    }

    public long hitCount() { return cache.stats().hitCount(); }
    public long estimatedSize() { return cache.estimatedSize(); }

    private record CacheKey(Long tenantId, Long userId, Long organizationId,
                            Long departmentId, String productCode, String moduleCode,
                            String environmentCode, String key) {
    }
}
