package com.rhn.treatment.api;

/** Public treatment boundary used by refund coordination. */
public interface RefundTreatmentDirectory {
    boolean isExecutedOrInProgress(Long tenantId, Long treatmentSourceId);
}
