package com.rhn.platform.maintenance.api;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/** Test purpose is explicit and durable; derived business objects resolve it through their owning encounter. */
public interface MaintenanceTestDataDirectory {
    Optional<TestOrigin> origin(Long tenantId, String resourceType, Long resourceId);
    Map<Long, TestOrigin> origins(Long tenantId, String resourceType, List<Long> resourceIds);
    record TestOrigin(Long batchId, Long organizationId, Instant taggedAt) {}
}
