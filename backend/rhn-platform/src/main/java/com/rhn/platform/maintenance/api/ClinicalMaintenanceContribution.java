package com.rhn.platform.maintenance.api;

import com.rhn.shared.context.ExecutionContext;
import java.util.List;
import java.util.Set;
import static com.rhn.platform.maintenance.api.MaintenanceModels.*;
import static com.rhn.platform.maintenance.api.MaintenanceRelationalData.*;

/** Each domain declares its owned records and applies its normal business invariants before deletion. */
public interface ClinicalMaintenanceContribution {
    String code();
    default int beforeDeleteOrder() { return 0; }
    List<TableDefinition> tables();
    /** Explicit owned parent links, e.g. an appointment owned by a selected registration. */
    default java.util.Map<String, Set<Long>> relatedIdentifiers(Capture snapshot) { return java.util.Map.of(); }
    /** Exact preserved projections needed for compensation; these do not expand the deletion closure. */
    default List<TableSnapshot> additionalSnapshots(ExecutionContext actor, Scope scope, Capture snapshot) { return List.of(); }
    default List<PreviewLine> compensationPreview(Capture snapshot, Set<String> modules) { return List.of(); }
    List<Issue> inspect(ExecutionContext actor, Scope scope, Capture snapshot, Set<String> modules, List<Root> roots);
    void beforeDelete(ExecutionContext actor, Scope scope, Capture snapshot, Set<String> modules);
    void verify(ExecutionContext actor, Scope scope, Capture snapshot, Set<String> modules);
    void afterCommit(ExecutionContext actor, Scope scope, Capture snapshot, Set<String> modules);
}
