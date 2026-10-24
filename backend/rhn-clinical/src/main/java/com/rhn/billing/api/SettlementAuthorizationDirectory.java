package com.rhn.billing.api;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/** Read-only billing boundary used by fulfillment modules before clinical execution. */
public interface SettlementAuthorizationDirectory {
    Optional<Long> finalizedSettlementForRequest(Long tenantId, Long requestId, String sourceType);

    /**
     * Batch form of {@link #finalizedSettlementForRequest}: keyed by request id, absent entries mean "not settled".
     */
    default Map<Long, Long> finalizedSettlementsForRequests(Long tenantId, Collection<Long> requestIds,
                                                            String sourceType) {
        Map<Long, Long> result = new LinkedHashMap<>();
        for (Long id : requestIds) {
            if (id != null && !result.containsKey(id)) {
                result.put(id, finalizedSettlementForRequest(tenantId, id, sourceType).orElse(null));
            }
        }
        return result;
    }
}

