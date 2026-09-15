package com.rhn.pharmacy.api;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.Map;

/** Read-only ward delivery progress exposed to inpatient coordination views. */
public interface WardDeliveryDirectory {
    WardDeliverySummary summarize(Long tenantId, Long organizationId,
                                  Collection<Long> encounterIds);

    DeliveryGate deliveryGate(Long tenantId, Long dispenseId);

    record WardDeliveryProgress(int pendingDispatchCount, int inTransitCount,
                                int discrepancyCount) {
        public int openCount() {
            return pendingDispatchCount + inTransitCount + discrepancyCount;
        }
    }

    record WardDeliverySummary(WardDeliveryProgress total,
                               Map<Long, WardDeliveryProgress> byEncounter) {
        public WardDeliverySummary {
            byEncounter = Map.copyOf(byEncounter);
        }

        public static WardDeliverySummary empty() {
            return new WardDeliverySummary(new WardDeliveryProgress(0, 0, 0), Map.of());
        }
    }

    record DeliveryGate(boolean deliveryRequired, boolean ready, Long deliveryId, String status,
                        BigDecimal receivedQuantity, String unitCode) {
        public static DeliveryGate notRequired() {
            return new DeliveryGate(false, true, null, "NOT_REQUIRED", BigDecimal.ZERO, null);
        }
    }
}
