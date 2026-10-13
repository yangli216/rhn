package com.rhn.healthcore.maintenance;

import com.rhn.platform.maintenance.api.ClinicalMaintenanceSupport;
import org.springframework.stereotype.Component;

@Component
public class HealthCoreMaintenanceContribution extends ClinicalMaintenanceSupport {
    public HealthCoreMaintenanceContribution() { super("HEALTHCORE", HealthCoreMaintenanceTables.all()); }

    @Override public void verify(com.rhn.shared.context.ExecutionContext actor,
            com.rhn.platform.maintenance.api.MaintenanceModels.Scope scope,
            com.rhn.platform.maintenance.api.MaintenanceRelationalData.Capture snapshot, java.util.Set<String> modules) {
        // Patient identity/profile rows remain retained; only encounter-owned context is removed.
    }
}
