package com.rhn.platform.realtime.application;

import java.util.List;
import java.util.Set;

/**
 * Online connection metadata store. The first implementation is process-local; a Redis lease
 * implementation can replace it without changing the aggregation and web layers.
 */
public interface PresenceLeaseStore {
    void upsert(PresenceConnectionSnapshot connection);

    void remove(Long tenantId, String connectionId);

    List<PresenceConnectionSnapshot> findByTenant(Long tenantId);

    Set<Long> activeTenants();
}
