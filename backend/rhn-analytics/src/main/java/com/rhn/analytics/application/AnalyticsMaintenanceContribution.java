package com.rhn.analytics.application;

import com.rhn.platform.maintenance.api.ClinicalMaintenanceSupport;
import org.springframework.stereotype.Component;

@Component
public class AnalyticsMaintenanceContribution extends ClinicalMaintenanceSupport {
    public AnalyticsMaintenanceContribution() { super("ANALYTICS", AnalyticsMaintenanceTables.all()); }
}
