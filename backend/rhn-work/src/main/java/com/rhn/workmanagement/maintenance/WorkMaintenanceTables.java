package com.rhn.workmanagement.maintenance;

import com.rhn.platform.maintenance.api.MaintenanceRelationalData.TableDefinition;
import java.util.List;

/** Domain-owned maintenance definitions; protected configuration and immutable facts remain retained. */
final class WorkMaintenanceTables {
    private WorkMaintenanceTables() {}
    static List<TableDefinition> all() {
        return List.of(
                new TableDefinition("RHN_SYS_ANN", "ID_SYS_ANN", "OUTPATIENT", "体系公告", false),
                new TableDefinition("RHN_SYS_ANN_READ_RCPT", "ID_ANN_READ_RCPT", "OUTPATIENT", "公告已读票据", false),
                new TableDefinition("RHN_SYS_PORTAL_NOTIFY", "ID_PORTAL_NOTIFY", "OUTPATIENT", "门户通知", false),
                new TableDefinition("RHN_SYS_WORK_TASK", "ID_WORK_TASK", "OUTPATIENT", "工作任务", false),
                new TableDefinition("RHN_SYS_WORK_TASK_HIST", "ID_WORK_TASK_HIST", "OUTPATIENT", "工作任务历史", false)
        );
    }
}
