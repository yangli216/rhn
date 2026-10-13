package com.rhn.healthplanning.maintenance;

import com.rhn.platform.maintenance.api.MaintenanceRelationalData.TableDefinition;
import java.util.List;

/** Domain-owned maintenance definitions; protected configuration and immutable facts remain retained. */
final class CareMaintenanceTables {
    private CareMaintenanceTables() {}
    static List<TableDefinition> all() {
        return List.of(
                new TableDefinition("RHN_HPL_CARE_TASK", "ID_CARE_TASK", "OUTPATIENT", "照护任务", false),
                new TableDefinition("RHN_HPL_CARE_TASK_EVT", "ID_CARE_TASK_EVT", "OUTPATIENT", "照护任务事件", false)
        );
    }
}
