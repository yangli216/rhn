package com.rhn.platform.maintenance.api;

import java.util.List;
import java.util.Map;
import java.util.Set;
import static com.rhn.platform.maintenance.api.MaintenanceModels.*;

/** Internal domain-declared data primitive. Table definitions never come from HTTP input. */
public interface MaintenanceRelationalData {
    Capture capture(Long tenantId, List<TableDefinition> definitions, Map<String, Set<Long>> seeds);
    List<Issue> dependencies(Long tenantId, Capture capture, Set<String> deleteModules, Set<Long> rootIds,
                             Set<Long> organizationIds);
    void delete(Long tenantId, Capture capture, Set<String> deleteModules);
    void verifyDeleted(Long tenantId, Capture capture, Set<String> deleteModules);
    List<TableDefinition> schemaTables();

    record TableDefinition(String name, String key, String module, String label, boolean retained, Set<String> detachColumns) {
        public TableDefinition { detachColumns = detachColumns == null ? Set.of() : Set.copyOf(detachColumns); }
        public TableDefinition(String name, String key, String module, String label, boolean retained) {
            this(name, key, module, label, retained, Set.of());
        }
    }
    record Cell(int jdbcType, String value) {}
    record Row(Long id, Map<String, Cell> cells) {}
    record TableSnapshot(TableDefinition definition, List<Row> rows) {}
    record Capture(List<TableSnapshot> tables, Map<String, Set<Long>> identifiers) {}
}
