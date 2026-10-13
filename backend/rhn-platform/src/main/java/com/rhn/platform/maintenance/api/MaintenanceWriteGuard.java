package com.rhn.platform.maintenance.api;

/** HTTP and background writers participate in the same durable maintenance barrier. */
public interface MaintenanceWriteGuard {
    Permit enter(Long tenantId);
    interface Permit extends AutoCloseable { @Override void close(); }
}
