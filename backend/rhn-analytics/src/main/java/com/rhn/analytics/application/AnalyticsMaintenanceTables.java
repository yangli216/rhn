package com.rhn.analytics.application;

import com.rhn.platform.maintenance.api.MaintenanceRelationalData.TableDefinition;
import java.util.List;

/** Domain-owned maintenance definitions; protected configuration and immutable facts remain retained. */
final class AnalyticsMaintenanceTables {
    private AnalyticsMaintenanceTables() {}
    static List<TableDefinition> all() {
        return List.of(
                new TableDefinition("RHN_AN_AUDIT_EVT", "ID_AUDIT_EVT", "OUTPATIENT", "一行代表分析审计事件", true),
                new TableDefinition("RHN_AN_CATALOG_VER", "ID_CATALOG_VER", "OUTPATIENT", "一行代表分析目录的一个版本", true),
                new TableDefinition("RHN_AN_DRAFT_VER", "ID_DRAFT_VER", "OUTPATIENT", "一行代表分析草稿的一个版本", true),
                new TableDefinition("RHN_AN_RUN", "ID_RUN", "OUTPATIENT", "一行代表一次分析运行", true)
        );
    }
}
