package com.rhn.pharmacy.api;

/**
 * Public pharmacy boundary used by refund coordination.
 * Keeps billing/coordination code away from pharmacy domain objects and repositories.
 */
public interface RefundPharmacyDirectory {
    RefundFulfillmentStatus statusForRequest(Long tenantId, Long medicationRequestId);

    void cancelUnfulfilledForRefund(Long tenantId, Long medicationRequestId);

    record RefundFulfillmentStatus(String state, String sourceStatus) {
        public boolean dispensed() {
            return "DISPENSED".equals(state);
        }

        public boolean returned() {
            return "RETURNED".equals(state);
        }

        public static RefundFulfillmentStatus undispensed(String sourceStatus) {
            return new RefundFulfillmentStatus("UNDISPENSED", sourceStatus);
        }
    }
}
