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
        if (leaseKeys == null) throw new IllegalStateException("Presence lease index was not returned");
        if (leaseKeys.isEmpty()) return List.of();

        List<String> orderedKeys = List.copyOf(leaseKeys);
        List<String> payloads = redis.opsForValue().multiGet(orderedKeys);
        if (payloads == null || payloads.size() != orderedKeys.size()) {
            throw new IllegalStateException("Presence lease lookup is incomplete");
        }
        List<PresenceConnectionSnapshot> result = new ArrayList<>();
        for (int index = 0; index < orderedKeys.size(); index++) {
            String payload = payloads.get(index);
            if (payload == null) {
                redis.opsForZSet().remove(indexKey, orderedKeys.get(index));
                continue;
            }
            PresenceConnectionSnapshot snapshot;
            try {
                snapshot = jsonCodec.read(payload, PresenceConnectionSnapshot.class);
            } catch (RuntimeException error) {
                throw new IllegalStateException("Presence lease data cannot be decoded", error);
            }
            requireSnapshot(tenantId, orderedKeys.get(index), snapshot);
            result.add(snapshot);
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
        if (values == null) throw new IllegalStateException("Presence tenant index was not returned");
        if (values.isEmpty()) return Set.of();
        java.util.HashSet<Long> result = new java.util.HashSet<>();
        values.forEach(value -> {
            try {
                Long tenantId = Long.valueOf(value);
                if (tenantId <= 0 || !tenantId.toString().equals(value)) throw new NumberFormatException("Invalid tenant identifier");
                result.add(tenantId);
            } catch (NumberFormatException error) {
                throw new IllegalStateException("Presence tenant index contains an invalid identifier", error);
            }
        });
        return Set.copyOf(result);
    }

    private void requireSnapshot(Long tenantId, String key, PresenceConnectionSnapshot value) {
        if (value == null || !tenantId.equals(value.tenantId()) || value.userId() == null || value.userId() <= 0
                || value.connectionId() == null || value.connectionId().isBlank()
                || !key.equals(leaseKey(tenantId, value.connectionId()))
                || value.instanceId() == null || value.instanceId().isBlank()
                || value.username() == null || value.username().isBlank()
                || value.connectedAt() == null || value.lastSeenAt() == null || value.lastActivityAt() == null
                || value.lastSeenAt().isBefore(value.connectedAt()) || value.lastActivityAt().isBefore(value.connectedAt())) {
            throw new IllegalStateException("Presence lease identity or timestamps are invalid");
        }
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
