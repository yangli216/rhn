package com.rhn.outpatient.api;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/** Read-only referral facts consumed by the cross-module outpatient flow board. */
public interface OutpatientReferralFlowDirectory {
    Map<Long, ReferralFlowSnapshot> summarize(Long tenantId, List<Long> encounterIds);

    record ReferralFlowSnapshot(
            int totalCount,
            int pendingCount,
            int completedCount,
            String activeType,
            String activeStatus,
            String targetDepartmentName,
            Instant pendingSince,
            Long targetEncounterId
    ) {}
}
