package com.rhn.outpatient.api;

/**
 * Fulfillment-side check consulted before an issued outpatient order is cancelled. Each fulfillment module
 * (pharmacy, diagnostics, treatment) contributes one guard for the orders it owns, so the ordering module never
 * reads their domain objects. Payment is deliberately not checked: a paid but unfulfilled order may be cancelled and
 * its charge reversal is refunded through billing.
 */
public interface OrderFulfillmentGuard {
    String MEDICATION_REQUEST = "MEDICATION_REQUEST";
    String SERVICE_REQUEST = "SERVICE_REQUEST";

    /** {@code serviceType} is only set for service requests. */
    record OrderRef(Long tenantId, String sourceType, Long requestId, String serviceType) {
        public static OrderRef medication(Long tenantId, Long requestId) {
            return new OrderRef(tenantId, MEDICATION_REQUEST, requestId, null);
        }

        public static OrderRef service(Long tenantId, Long requestId, String serviceType) {
            return new OrderRef(tenantId, SERVICE_REQUEST, requestId, serviceType);
        }
    }

    /**
     * @param forUpdate lock the fulfillment records so they cannot advance before the caller's transaction ends
     * @return a doctor-facing reason when the order can no longer be cancelled, otherwise {@code null}
     */
    String cancelBlockedReason(OrderRef order, boolean forUpdate);

    /** Releases fulfillment work that has not started (for example pending dispense tasks and reserved stock). */
    default void releaseUnstarted(OrderRef order) {
    }
}
