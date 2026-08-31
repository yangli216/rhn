package com.rhn.pharmacy.api;

import java.util.Collection;
import java.util.Map;

/** Patient-facing fulfillment progress, independent of the pharmacy workbench shape. */
public interface PharmacyFlowDirectory {
    Map<Long, PharmacyFlowSnapshot> summarize(Long tenantId, Long organizationId,
                                               Collection<Long> encounterIds);

    record PharmacyFlowSnapshot(int totalCount, int waitingCount, int inProgressCount,
                                int exceptionCount, int completedCount) {}
}
