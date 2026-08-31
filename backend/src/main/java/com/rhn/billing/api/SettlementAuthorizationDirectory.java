package com.rhn.billing.api;

import java.util.Optional;

/** Read-only billing boundary used by fulfillment modules before clinical execution. */
public interface SettlementAuthorizationDirectory {
    Optional<Long> finalizedSettlementForRequest(Long tenantId, Long requestId, String sourceType);
}

