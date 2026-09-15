package com.rhn.quality.medication.application;

import com.rhn.outpatient.api.MedicationSafetyDecision.Status;
import java.util.List;

public final class DecisionAggregator {
    private DecisionAggregator() {}

    /** Known BLOCK remains actionable even when another rule failed; incompleteness is also returned separately. */
    public static Status aggregate(List<Status> decisions, boolean incomplete) {
        if (decisions.contains(Status.BLOCK)) return Status.BLOCK;
        if (incomplete || decisions.contains(Status.UNAVAILABLE)) return Status.UNAVAILABLE;
        if (decisions.contains(Status.REQUIRE_OVERRIDE)) return Status.REQUIRE_OVERRIDE;
        if (decisions.contains(Status.WARN)) return Status.WARN;
        return Status.PASS;
    }
}
