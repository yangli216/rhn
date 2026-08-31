package com.rhn.treatment.api;

import java.util.Collection;
import java.util.Map;

/** Compact treatment-execution facts for outpatient-flow coordination. */
public interface TreatmentFlowDirectory {
    Map<Long, TreatmentFlowSnapshot> summarize(Long tenantId, Collection<Long> encounterIds);

    record TreatmentFlowSnapshot(int totalCount, int settlementBlockedCount, int dispenseBlockedCount,
                                 int waitingCount, int inProgressCount, int exceptionCount,
                                 int completedCount) {}
}
