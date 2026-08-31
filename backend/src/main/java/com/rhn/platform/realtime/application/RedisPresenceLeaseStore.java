package com.rhn.platform.realtime.application;

import com.rhn.shared.json.JsonCodec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Set;

@Component
@ConditionalOnProperty(name = "rhn.presence.store", havingValue = "redis")
public class RedisPresenceLeaseStore implements PresenceLeaseStore {
    private final StringRedisTemplate redis;
    private final JsonCodec jsonCodec;
    private final Duration leaseTtl;
    private final String keyPrefix;

    public RedisPresenceLeaseStore(StringRedisTemplate redis, JsonCodec jsonCodec,
                                   @Value("${rhn.presence.lease-ttl:PT75S}") Duration leaseTtl,
                                   @Value("${rhn.presence.redis-key-prefix:rhn:presence}") String keyPrefix) {
        if (leaseTtl.isNegative() || leaseTtl.isZero()) {
            throw new IllegalArgumentException("rhn.presence.lease-ttl must be positive");
        }
        this.redis = redis;
        this.jsonCodec = jsonCodec;
        this.leaseTtl = leaseTtl;
        this.keyPrefix = keyPrefix.replaceAll(":+$", "");
    }

    @Override
    public void upsert(PresenceConnectionSnapshot connection) {
        String leaseKey = leaseKey(connection.tenantId(), connection.connectionId());
        String indexKey = indexKey(connection.tenantId());
        long expiresAt = Instant.now().plus(leaseTtl).toEpochMilli();
        redis.opsForValue().set(leaseKey, jsonCodec.write(connection), leaseTtl);
        redis.opsForZSet().add(indexKey, leaseKey, expiresAt);
        redis.expire(indexKey, leaseTtl.multipliedBy(2));
        redis.opsForZSet().add(tenantIndexKey(), connection.tenantId().toString(), expiresAt + leaseTtl.toMillis());
    }

    @Override
    public void remove(Long tenantId, String connectionId) {
        String leaseKey = leaseKey(tenantId, connectionId);
        redis.delete(leaseKey);
        redis.opsForZSet().remove(indexKey(tenantId), leaseKey);
    }

    @Override
    public List<PresenceConnectionSnapshot> findByTenant(Long tenantId) {
        String indexKey = indexKey(tenantId);
        double now = Instant.now().toEpochMilli();
        redis.opsForZSet().removeRangeByScore(indexKey, Double.NEGATIVE_INFINITY, now - 1);
        Set<String> leaseKeys = redis.opsForZSet().rangeByScore(indexKey, now, Double.POSITIVE_INFINITY);
        if (leaseKeys == null || leaseKeys.isEmpty()) return List.of();

        List<String> orderedKeys = List.copyOf(leaseKeys);
        List<String> payloads = redis.opsForValue().multiGet(orderedKeys);
        if (payloads == null) return List.of();
        List<PresenceConnectionSnapshot> result = new ArrayList<>();
        for (int index = 0; index < orderedKeys.size(); index++) {
            String payload = index < payloads.size() ? payloads.get(index) : null;
            if (payload == null) {
                redis.opsForZSet().remove(indexKey, orderedKeys.get(index));
                continue;
            }
            try {
                PresenceConnectionSnapshot snapshot = jsonCodec.read(payload, PresenceConnectionSnapshot.class);
                if (tenantId.equals(snapshot.tenantId())) result.add(snapshot);
                else redis.opsForZSet().remove(indexKey, orderedKeys.get(index));
            } catch (RuntimeException error) {
                redis.delete(orderedKeys.get(index));
                redis.opsForZSet().remove(indexKey, orderedKeys.get(index));
            }
        }
        result.sort(Comparator.comparing(PresenceConnectionSnapshot::connectedAt)
                .thenComparing(PresenceConnectionSnapshot::connectionId));
        return List.copyOf(result);
    }

    @Override
    public Set<Long> activeTenants() {
        double now = Instant.now().toEpochMilli();
        String key = tenantIndexKey();
        redis.opsForZSet().removeRangeByScore(key, Double.NEGATIVE_INFINITY, now - 1);
        Set<String> values = redis.opsForZSet().rangeByScore(key, now, Double.POSITIVE_INFINITY);
        if (values == null || values.isEmpty()) return Set.of();
        java.util.HashSet<Long> result = new java.util.HashSet<>();
        values.forEach(value -> {
            try { result.add(Long.valueOf(value)); }
            catch (NumberFormatException error) { redis.opsForZSet().remove(key, value); }
        });
        return Set.copyOf(result);
    }

    String leaseKey(Long tenantId, String connectionId) {
        return tenantPrefix(tenantId) + ":lease:" + connectionId;
    }

    String indexKey(Long tenantId) {
        return tenantPrefix(tenantId) + ":leases";
    }

    String tenantIndexKey() { return keyPrefix + ":tenants"; }

    private String tenantPrefix(Long tenantId) {
        // Curly braces keep a tenant's index and leases in one Redis Cluster hash slot.
        return keyPrefix + ":{" + tenantId + "}";
    }
}
