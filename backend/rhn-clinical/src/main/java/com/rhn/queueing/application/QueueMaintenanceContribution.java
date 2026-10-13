package com.rhn.queueing.application;

import com.rhn.platform.maintenance.api.ClinicalMaintenanceSupport;
import org.springframework.stereotype.Component;

@Component
public class QueueMaintenanceContribution extends ClinicalMaintenanceSupport {
    public QueueMaintenanceContribution() { super("QUEUEING", QueueMaintenanceTables.all()); }
}
