package com.rhn.billing.api;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.Map;

/** Compact account facts for cross-module outpatient-flow coordination. */
public interface BillingFlowDirectory {
    Map<Long, BillingFlowSnapshot> summarize(Long tenantId, Collection<Long> encounterIds);

    record BillingFlowSnapshot(int accountCount, BigDecimal balance, BigDecimal outstandingAmount,
                               BigDecimal refundableAmount) {}
}
