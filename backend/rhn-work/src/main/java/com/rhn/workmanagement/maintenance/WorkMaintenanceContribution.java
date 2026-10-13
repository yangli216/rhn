package com.rhn.workmanagement.maintenance;

import com.rhn.platform.maintenance.api.ClinicalMaintenanceSupport;
import org.springframework.stereotype.Component;

@Component
public class WorkMaintenanceContribution extends ClinicalMaintenanceSupport {
    public WorkMaintenanceContribution() { super("WORKMANAGEMENT", WorkMaintenanceTables.all()); }
}
