package com.rhn.ai.application;

import com.rhn.platform.maintenance.api.MaintenanceRelationalData.TableDefinition;
import java.util.List;

/** Domain-owned maintenance definitions; protected configuration and immutable facts remain retained. */
final class AiMaintenanceTables {
    private AiMaintenanceTables() {}
    static List<TableDefinition> all() {
        return List.of(
                new TableDefinition("RHN_AI_SUGGEST", "ID_AI_SUGGEST", "OUTPATIENT", "AI建议", false),
                new TableDefinition("RHN_AI_SUGGEST_EVT", "ID_AI_SUGGEST_EVT", "OUTPATIENT", "AI建议事件", false)
        );
    }
}
