package com.rhn.platform.eventing.application;

import com.rhn.platform.maintenance.api.*;
import com.rhn.shared.context.ExecutionContext;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;
import java.util.*;
import static com.rhn.platform.maintenance.api.MaintenanceModels.*;
import static com.rhn.platform.maintenance.api.MaintenanceRelationalData.*;

@Component
public class EventMaintenanceContribution extends ClinicalMaintenanceSupport {
    private final NamedParameterJdbcTemplate jdbc;
    private final MaintenanceRelationalData data;
    public EventMaintenanceContribution(NamedParameterJdbcTemplate jdbc, MaintenanceRelationalData data) {
        super("EVENTING", List.of(new TableDefinition("RHN_INT_OUTBOX_EVT", "ID_EVT", "OUTPATIENT", "业务事件留痕", true)));
        this.jdbc = jdbc; this.data = data;
    }
    @Override public int beforeDeleteOrder() { return 100; }
    @Override public List<TableSnapshot> additionalSnapshots(ExecutionContext actor, Scope scope, Capture snapshot) {
        Set<Long> ids = new TreeSet<>();
        var aggregateIds = snapshot.tables().stream().filter(table -> !table.definition().retained())
                .flatMap(table -> table.rows().stream()).map(Row::id).distinct().sorted().toList();
        for (int start = 0; start < aggregateIds.size(); start += 800) {
            var chunk = aggregateIds.subList(start, Math.min(start + 800, aggregateIds.size()));
            ids.addAll(jdbc.query("select ID_EVT from RHN_INT_OUTBOX_EVT where ID_TNT=:tenant and ID_AGG in (:ids)",
                    Map.of("tenant", scope.tenantId(), "ids", chunk), (rs, index) -> rs.getLong(1)));
        }
        if (ids.isEmpty()) return List.of();
        return data.capture(scope.tenantId(), tables(), Map.of("ID_EVT", ids)).tables();
    }
    @Override public void beforeDelete(ExecutionContext actor, Scope scope, Capture snapshot, Set<String> modules) {
        Long task = MaintenanceExecutionScope.currentTaskId().orElseThrow();
        Set<Long> removed = snapshot.tables().stream()
                .filter(table -> !table.definition().retained() && modules.contains(table.definition().module()))
                .flatMap(table -> table.rows().stream()).map(Row::id).collect(java.util.stream.Collectors.toSet());
        for (Long resource : removed) jdbc.update("insert into RHN_SYS_MAINT_RETIRE (ID_TNT,ID_RSRC,ID_MAINT_TASK) values (:tenant,:resource,:task)",
                Map.of("tenant", scope.tenantId(), "resource", resource, "task", task));
        var identifiers = removed.stream().sorted().toList();
        for (int start = 0; start < identifiers.size(); start += 800) {
            var chunk = identifiers.subList(start, Math.min(start + 800, identifiers.size()));
            jdbc.update("update RHN_INT_OUTBOX_EVT set SD_PUBLCN_STATUS='DISCARDED',DES_LAST_ERROR=:reason,"
                            + "ID_USER_CLAIMED=null,DT_CLAIMED_UNTIL=null where ID_TNT=:tenant and ID_AGG in (:ids)",
                    Map.of("tenant", scope.tenantId(), "ids", chunk, "reason", "测试业务已清理；维护任务 " + task));
        }
    }
}
