package com.rhn.platform.maintenance.api;

import com.rhn.shared.context.ExecutionContext;
import java.util.List;
import java.util.Set;
import static com.rhn.platform.maintenance.api.MaintenanceModels.*;

/** Implemented by the domain owning the data; platform never imports domain repositories. */
public interface MaintenanceParticipant {
    Dataset dataset();

    /** Attest only explicitly reviewed test roots; reject unknown ownership or unsafe real-world effects. */
    void validateTestRoots(ExecutionContext actor, Scope scope, List<Root> roots, String evidence);

    /** Scope-wide reset is available only when a domain can enumerate its complete root set. */
    default List<Root> resetRoots(ExecutionContext actor, Scope scope) {
        throw com.rhn.shared.api.BusinessErrors.badRequest("MAINTENANCE_RESET_UNSUPPORTED", "该数据集尚未接入上线前重置");
    }

    PreparedChange preview(ExecutionContext actor, Scope scope, Operation operation, Set<String> modules,
                           List<Root> roots, String inputJson);

    /** Encrypted at rest by the maintenance service. Must include same-scope recovery data. */
    String backup(ExecutionContext actor, Scope scope, PreparedChange change);

    /** Database changes run in one transaction; implementations must not perform irreversible external IO. */
    void apply(ExecutionContext actor, Scope scope, PreparedChange change);

    void verify(ExecutionContext actor, Scope scope, PreparedChange change);

    /** Retryable cache/projection work after database commit. */
    void afterCommit(ExecutionContext actor, Scope scope, PreparedChange change);

    record PreparedChange(String payloadJson, List<Impact> impacts, List<Issue> blockers, List<String> retained, List<PreviewLine> lines) {
        public PreparedChange(String payloadJson, List<Impact> impacts, List<Issue> blockers, List<String> retained) {
            this(payloadJson, impacts, blockers, retained, List.of());
        }
        public PreparedChange {
            impacts = List.copyOf(impacts); blockers = List.copyOf(blockers); retained = List.copyOf(retained);
            lines = lines == null ? List.of() : List.copyOf(lines);
        }
    }
}
