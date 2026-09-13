package com.rhn.outpatient.ordering;

import java.util.List;

public record SplitPrescriptionPlan(
        String categoryCode,
        String title,
        Long stockSiteId,
        String stockSiteName,
        String routeGroupType,
        List<String> ruleReasons,
        List<PlannedMedicationItem> items
) {
    public record PlannedMedicationItem(
            BatchOrderMedicationItem item,
            boolean groupLeader,
            String groupKey
    ) {}
}
