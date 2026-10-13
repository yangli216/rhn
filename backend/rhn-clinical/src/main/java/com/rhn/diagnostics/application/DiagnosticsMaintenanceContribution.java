package com.rhn.diagnostics.application;

import com.rhn.platform.maintenance.api.ClinicalMaintenanceSupport;
import com.rhn.platform.maintenance.api.MaintenanceRelationalData.TableDefinition;
import org.springframework.stereotype.Component;
import java.util.List;

/** Encounter-owned observations; external diagnostic workflows remain dependency blockers. */
@Component
public class DiagnosticsMaintenanceContribution extends ClinicalMaintenanceSupport {
    public DiagnosticsMaintenanceContribution() {
        super("DIAGNOSTICS", List.of(new TableDefinition("RHN_VIS_OBS", "ID_OBS", "OUTPATIENT", "门诊观察", false)));
    }
}
