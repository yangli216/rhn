package com.rhn.platform.maintenance.api;

import com.rhn.shared.context.ExecutionContext;
import java.math.BigDecimal;
import java.util.List;
import java.util.Set;
import static com.rhn.platform.maintenance.api.MaintenanceModels.*;
import static com.rhn.platform.maintenance.api.MaintenanceRelationalData.*;

/** Shared snapshot access for domain contributors; business compensation remains in the owning domain. */
public abstract class ClinicalMaintenanceSupport implements ClinicalMaintenanceContribution {
    private final String code;
    private final List<TableDefinition> tables;
    protected ClinicalMaintenanceSupport(String code, List<TableDefinition> tables) {
        this.code = code; this.tables = List.copyOf(tables);
    }
    @Override public String code() { return code; }
    @Override public List<TableDefinition> tables() { return tables; }
    @Override public List<Issue> inspect(ExecutionContext actor, Scope scope, Capture snapshot, Set<String> modules, List<Root> roots) { return List.of(); }
    @Override public void beforeDelete(ExecutionContext actor, Scope scope, Capture snapshot, Set<String> modules) {}
    @Override public void verify(ExecutionContext actor, Scope scope, Capture snapshot, Set<String> modules) {}
    @Override public void afterCommit(ExecutionContext actor, Scope scope, Capture snapshot, Set<String> modules) {}
    protected List<Row> rows(Capture snapshot, String table) {
        return snapshot.tables().stream().filter(value -> value.definition().name().equals(table))
                .findFirst().map(TableSnapshot::rows).orElse(List.of());
    }
    protected static String text(Row row, String column) {
        if (!row.cells().containsKey(column)) throw com.rhn.shared.api.BusinessErrors.conflict(
                "MAINTENANCE_SCHEMA_MISMATCH", "领域维护字段与已迁移结构不一致：" + column);
        var cell = row.cells().get(column);
        return cell == null ? null : cell.value();
    }
    protected static Long id(Row row, String column) {
        String value = text(row, column);
        return value == null ? null : new BigDecimal(value).longValueExact();
    }
    protected static BigDecimal amount(Row row, String column) {
        String value = text(row, column);
        return value == null ? BigDecimal.ZERO : new BigDecimal(value);
    }
}
