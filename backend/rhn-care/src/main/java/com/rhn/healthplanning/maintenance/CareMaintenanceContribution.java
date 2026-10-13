package com.rhn.healthplanning.maintenance;

import com.rhn.platform.maintenance.api.ClinicalMaintenanceSupport;
import org.springframework.stereotype.Component;

@Component
public class CareMaintenanceContribution extends ClinicalMaintenanceSupport {
    public CareMaintenanceContribution() { super("HEALTHPLANNING", CareMaintenanceTables.all()); }
}
