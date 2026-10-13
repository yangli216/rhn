package com.rhn.platform.maintenance.api;

import com.rhn.shared.context.ExecutionContext;
import java.util.List;
import static com.rhn.platform.maintenance.api.MaintenanceModels.*;

public interface MaintenanceRootDirectory {
    List<RootCandidate> candidates(ExecutionContext actor, Scope scope, String query);
    List<Root> allRoots(ExecutionContext actor, Scope scope);
    void requireRoots(ExecutionContext actor, Scope scope, List<Root> roots);
    @io.swagger.v3.oas.annotations.media.Schema(name = "MaintenanceRootCandidate")
    record RootCandidate(String module, String resourceType, Long resourceId, Long organizationId,
                         String businessNo, String status, java.time.Instant createdAt, Long testBatchId) {}
}
