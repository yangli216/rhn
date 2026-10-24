package com.rhn.pharmacy.api;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.Map;

/** Read-only ward delivery progress exposed to inpatient coordination views. */
public interface WardDeliveryDirectory {
    WardDeliverySummary summarize(Long tenantId, Long organizationId,
                                  Collection<Long> encounterIds);

    DeliveryGate deliveryGate(Long tenantId, Long dispenseId);

    /**
     * 批量形式：一次取回多条发药的配送闸门，供停嘱闭环等批量装配使用；
     * 默认实现退化为逐条调用 {@link #deliveryGate}。
     */
    default Map<Long, DeliveryGate> deliveryGates(Long tenantId, Collection<Long> dispenseIds) {
        Map<Long, DeliveryGate> result = new java.util.LinkedHashMap<>();
        for (Long dispenseId : dispenseIds) {
            result.put(dispenseId, deliveryGate(tenantId, dispenseId));
        }
        return result;
    }

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
