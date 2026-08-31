package com.rhn.platform.realtime.application;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.data.redis.core.ZSetOperations;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class RedisPresenceLeaseStoreTest {
    private final StringRedisTemplate redis = mock(StringRedisTemplate.class);
    @SuppressWarnings("unchecked")
    private final ValueOperations<String, String> values = mock(ValueOperations.class);
    @SuppressWarnings("unchecked")
    private final ZSetOperations<String, String> sortedSets = mock(ZSetOperations.class);
    private final Map<String, String> payloads = new HashMap<>();
    private final Map<String, Map<String, Double>> indexes = new HashMap<>();
    private final TestJsonCodec jsonCodec = new TestJsonCodec();

    @BeforeEach
    void emulateSharedRedisDataStructures() {
        when(redis.opsForValue()).thenReturn(values);
        when(redis.opsForZSet()).thenReturn(sortedSets);
        doAnswer(invocation -> {
            payloads.put(invocation.getArgument(0), invocation.getArgument(1));
            return null;
        }).when(values).set(anyString(), anyString(), any(Duration.class));
        when(values.multiGet(any(Collection.class))).thenAnswer(invocation -> {
            Collection<String> keys = invocation.getArgument(0);
            return keys.stream().map(payloads::get).toList();
        });
        when(sortedSets.add(anyString(), anyString(), anyDouble())).thenAnswer(invocation -> {
            indexes.computeIfAbsent(invocation.getArgument(0), ignored -> new HashMap<>())
                    .put(invocation.getArgument(1), invocation.getArgument(2));
            return true;
        });
        when(sortedSets.rangeByScore(anyString(), anyDouble(), anyDouble())).thenAnswer(invocation -> {
            String key = invocation.getArgument(0); double minimum = invocation.getArgument(1);
            double maximum = invocation.getArgument(2);
            Set<String> matches = new LinkedHashSet<>();
            indexes.getOrDefault(key, Map.of()).entrySet().stream()
                    .filter(entry -> entry.getValue() >= minimum && entry.getValue() <= maximum)
                    .sorted(Map.Entry.comparingByKey()).forEach(entry -> matches.add(entry.getKey()));
            return matches;
        });
        when(sortedSets.removeRangeByScore(anyString(), anyDouble(), anyDouble())).thenAnswer(invocation -> {
            String key = invocation.getArgument(0); double minimum = invocation.getArgument(1);
            double maximum = invocation.getArgument(2); List<String> expired = new ArrayList<>();
            indexes.getOrDefault(key, Map.of()).forEach((member, score) -> {
                if (score >= minimum && score <= maximum) expired.add(member);
            });
            Map<String, Double> index = indexes.get(key);
            if (index != null) expired.forEach(index::remove);
            return (long) expired.size();
        });
        when(sortedSets.remove(anyString(), any(Object[].class))).thenAnswer(invocation -> {
            Map<String, Double> index = indexes.get(invocation.getArgument(0));
            if (index == null) return 0L;
            long removed = 0;
            Object[] arguments = invocation.getArguments();
            for (int argument = 1; argument < arguments.length; argument++) {
                if (index.remove(String.valueOf(arguments[argument])) != null) removed++;
            }
            return removed;
        });
        when(redis.delete(anyString())).thenAnswer(invocation -> payloads.remove(invocation.getArgument(0)) != null);
    }

    @Test
    void two_application_instances_share_tenant_leases_without_connection_id_collisions() {
        RedisPresenceLeaseStore firstInstance = store();
        RedisPresenceLeaseStore secondInstance = store();
        Long tenantId = 362387869790209L; Instant now = Instant.now();
        PresenceConnectionSnapshot doctor = snapshot("instance-a-connection", tenantId, 101L, "doctor", now);
        PresenceConnectionSnapshot pharmacist = snapshot("instance-b-connection", tenantId, 102L, "pharmacist", now);

        firstInstance.upsert(doctor);
        secondInstance.upsert(pharmacist);

        assertThat(firstInstance.findByTenant(tenantId))
                .extracting(PresenceConnectionSnapshot::connectionId)
                .containsExactlyInAnyOrder("instance-a-connection", "instance-b-connection");
        assertThat(secondInstance.activeTenants()).containsExactly(tenantId);
        assertThat(firstInstance.indexKey(tenantId)).contains("{" + tenantId + "}");
        assertThat(firstInstance.leaseKey(tenantId, doctor.connectionId())).contains("{" + tenantId + "}");

        secondInstance.remove(tenantId, doctor.connectionId());
        assertThat(firstInstance.findByTenant(tenantId))
                .extracting(PresenceConnectionSnapshot::connectionId)
                .containsExactly("instance-b-connection");
    }

    private RedisPresenceLeaseStore store() {
        return new RedisPresenceLeaseStore(redis, jsonCodec, Duration.ofSeconds(75), "rhn:presence:");
    }

    private PresenceConnectionSnapshot snapshot(String connectionId, Long tenantId, Long userId,
                                                  String username, Instant now) {
        return new PresenceConnectionSnapshot(connectionId, connectionId.substring(0, 10), "session-" + userId,
                tenantId, userId,
                username, userId + 1000,
                362387869790211L, 362387869790212L, now, now, now);
    }
}
