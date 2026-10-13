package com.rhn.queueing.application;

import com.rhn.platform.maintenance.api.MaintenanceRelationalData.TableDefinition;
import java.util.List;

/** Domain-owned maintenance definitions; protected configuration and immutable facts remain retained. */
final class QueueMaintenanceTables {
    private QueueMaintenanceTables() {}
    static List<TableDefinition> all() {
        return List.of(
                new TableDefinition("RHN_SC_QUEUE_COUNT", "ID_QUEUE_COUNT", "OUTPATIENT", "队列计数器", false),
                new TableDefinition("RHN_SC_QUEUE_TICKET", "ID_QUEUE_TICKET", "OUTPATIENT", "排队号票", false),
                new TableDefinition("RHN_SC_QUEUE_TICKET_EVT", "ID_QUEUE_TICKET_EVT", "OUTPATIENT", "排队号票事件", false),
                new TableDefinition("RHN_SC_SVC_QUEUE", "ID_SVC_QUEUE", "OUTPATIENT", "服务队列", false)
        );
    }
}
