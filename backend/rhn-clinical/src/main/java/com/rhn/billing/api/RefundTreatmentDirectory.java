package com.rhn.billing.api;

/** Consumer-owned refund port, implemented by the treatment adapter. */
public interface RefundTreatmentDirectory {
    /**
     * Whether the treatment execution item of the given order (SERVICE_REQUEST or MEDICATION_REQUEST, the same
     * source type as the charge line) has been started, completed or ended in an exception after starting.
     */
    boolean isExecutedOrInProgress(Long tenantId, String sourceType, Long sourceId);
}
