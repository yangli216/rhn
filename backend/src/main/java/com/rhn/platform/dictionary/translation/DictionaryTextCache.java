package com.rhn.platform.dictionary.translation;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Map;
import java.util.function.Supplier;

@Component
public class DictionaryTextCache {
    private final Cache<CacheKey, Map<String, String>> cache;

    public DictionaryTextCache(
            @Value("${rhn.dictionary.translation.cache.maximum-size:10000}") long maximumSize,
            @Value("${rhn.dictionary.translation.cache.maximum-ttl:PT5M}") Duration maximumTtl) {
        if (maximumSize < 1 || maximumTtl.isZero() || maximumTtl.isNegative()) {
            throw new IllegalArgumentException("Dictionary translation cache limits must be positive");
        }
        this.cache = Caffeine.newBuilder()
                .maximumSize(maximumSize)
                .expireAfterWrite(maximumTtl)
                .recordStats()
                .build();
    }

    Map<String, String> get(Long tenantId, String dictionaryCode,
                            Supplier<Map<String, String>> loader) {
        if (tenantId == null) return Map.of();
        return cache.get(new CacheKey(tenantId, dictionaryCode),
                ignored -> Map.copyOf(loader.get()));
    }

    public void invalidateTenant(Long tenantId, String dictionaryCode) {
        if (tenantId != null) cache.invalidate(new CacheKey(tenantId, dictionaryCode));
    }

    public void invalidateDictionary(String dictionaryCode) {
        cache.asMap().keySet().removeIf(key -> key.dictionaryCode().equals(dictionaryCode));
        cache.cleanUp();
    }

    public long hitCount() {
        return cache.stats().hitCount();
    }

    public long estimatedSize() {
        return cache.estimatedSize();
    }

    private record CacheKey(Long tenantId, String dictionaryCode) {
    }
}
