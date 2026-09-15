package com.rhn.billing.api;

/** Consumer-owned refund port, implemented by the treatment adapter. */
public interface RefundTreatmentDirectory {
    boolean isExecutedOrInProgress(Long tenantId, Long treatmentSourceId);
}
