package com.rhn.pharmacy.api;

/** Narrow pharmacy boundary used by cross-domain refund coordination. */
public interface PharmacyRefundDirectory {
    RefundFulfillmentSnapshot refundFulfillment(Long tenantId, Long medicationRequestId);

    record RefundFulfillmentSnapshot(String status) {
        public static RefundFulfillmentSnapshot notIntake() {
            return new RefundFulfillmentSnapshot("NOT_INTAKE");
        }

        public boolean dispensed() {
            return "COMPLETED".equals(status) || "PARTIALLY_DISPENSED".equals(status);
        }

        public boolean returned() {
            return "RETURNED".equals(status) || "PARTIALLY_RETURNED".equals(status);
        }
    }
}
