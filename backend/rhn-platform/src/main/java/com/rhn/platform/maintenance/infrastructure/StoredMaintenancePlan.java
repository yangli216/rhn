package com.rhn.platform.maintenance.infrastructure;

import com.rhn.platform.maintenance.api.MaintenanceModels.*;
import com.rhn.platform.maintenance.api.MaintenanceParticipant.PreparedChange;
import com.rhn.shared.context.ExecutionContext;
import java.util.List;
import java.util.Set;

/** Internal encrypted immutable plan; never a controller response. */
public record StoredMaintenancePlan(
        ExecutionContext actor, Scope scope, Operation operation, String datasetCode, Set<String> modules,
        Long batchId, List<Root> roots, String inputJson, String reason, String ruleVersion,
        PreparedChange change) {}
