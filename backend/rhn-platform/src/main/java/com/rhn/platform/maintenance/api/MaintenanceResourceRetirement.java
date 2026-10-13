package com.rhn.platform.maintenance.api;

/** Discarded business identities prevent late event replays from recreating cleared projections. */
public interface MaintenanceResourceRetirement {
    boolean retired(Long tenantId, Long resourceId);
}
