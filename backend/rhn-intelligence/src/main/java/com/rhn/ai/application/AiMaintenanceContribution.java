package com.rhn.ai.application;

import com.rhn.platform.maintenance.api.ClinicalMaintenanceSupport;
import org.springframework.stereotype.Component;

@Component
public class AiMaintenanceContribution extends ClinicalMaintenanceSupport {
    public AiMaintenanceContribution() { super("AI", AiMaintenanceTables.all()); }
}
