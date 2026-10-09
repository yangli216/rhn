package com.rhn.outpatient.api;

import java.util.Map;
import java.util.Set;

/** Original ordering facts for downstream projections of already-authorized charges. */
public interface OutpatientOrderOriginDirectory {
    Map<Long, OrderOrigin> findByRequestIds(Long tenantId, Set<Long> medicationIds, Set<Long> serviceIds);

    record OrderOrigin(Long requestId, Long encounterId, Long organizationId, Long departmentId,
                       Long authorUserId, String serviceType) {}
}
