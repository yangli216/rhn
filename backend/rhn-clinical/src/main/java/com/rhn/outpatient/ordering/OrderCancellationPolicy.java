package com.rhn.outpatient.ordering;

import com.rhn.outpatient.api.OrderFulfillmentGuard;
import com.rhn.outpatient.api.OrderFulfillmentGuard.OrderRef;
import org.springframework.stereotype.Component;

import java.util.List;

import static com.rhn.shared.api.BusinessErrors.conflict;

/** Decides whether an issued order may still be cancelled, based on what the fulfillment modules have started. */
@Component
class OrderCancellationPolicy {
    private final List<OrderFulfillmentGuard> guards;

    OrderCancellationPolicy(List<OrderFulfillmentGuard> guards) {
        this.guards = guards;
    }

    /** Read-only check for display; {@code null} means the order can be cancelled. */
    String blockedReason(OrderRef order) {
        return reason(order, false);
    }

    /** Locks fulfillment records and rejects the cancellation when fulfillment has already started. */
    void requireCancellable(OrderRef order, String errorCode) {
        String reason = reason(order, true);
        if (reason != null) throw conflict(errorCode, reason);
    }

    void releaseUnstarted(OrderRef order) {
        guards.forEach(guard -> guard.releaseUnstarted(order));
    }

    private String reason(OrderRef order, boolean forUpdate) {
        for (OrderFulfillmentGuard guard : guards) {
            String reason = guard.cancelBlockedReason(order, forUpdate);
            if (reason != null) return reason;
        }
        return null;
    }
}
