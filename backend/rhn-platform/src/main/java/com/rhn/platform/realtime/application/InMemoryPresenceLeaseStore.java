package com.rhn.platform.realtime.application;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Component
@ConditionalOnProperty(name = "rhn.presence.store", havingValue = "memory", matchIfMissing = true)
public class InMemoryPresenceLeaseStore implements PresenceLeaseStore {
    private final ConcurrentHashMap<String, PresenceConnectionSnapshot> connections = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<Long, Instant> tenants = new ConcurrentHashMap<>();
    private final Duration tenantRetention;

    public InMemoryPresenceLeaseStore(@Value("${rhn.presence.lease-ttl:PT75S}") Duration leaseTtl) {
        tenantRetention = leaseTtl.multipliedBy(2);
    }

    @Override
    public void upsert(PresenceConnectionSnapshot connection) {
        connections.put(connection.connectionId(), connection);
        tenants.put(connection.tenantId(), Instant.now().plus(tenantRetention));
    }

    @Override
    public void remove(Long tenantId, String connectionId) {
        connections.remove(connectionId);
    }

    @Override
    public List<PresenceConnectionSnapshot> findByTenant(Long tenantId) {
        return connections.values().stream()
                .filter(value -> tenantId.equals(value.tenantId()))
                .toList();
    }

    @Override
    public Set<Long> activeTenants() {
        Instant now = Instant.now();
        tenants.entrySet().removeIf(entry -> entry.getValue().isBefore(now));
        return Set.copyOf(tenants.keySet());
    }
}
