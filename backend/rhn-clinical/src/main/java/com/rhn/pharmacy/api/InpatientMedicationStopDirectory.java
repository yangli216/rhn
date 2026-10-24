package com.rhn.pharmacy.api;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.Map;

/** Pharmacy-owned coordination boundary for closing fulfillment after an inpatient medication order stops. */
public interface InpatientMedicationStopDirectory {
    StopClosure freezeAfterOrderStop(StopCommand command);

    StopClosure closure(Long tenantId, Long medicationRequestId);

    /**
     * 批量读取停嘱闭环状态，供药房/住院列表一次装配。
     * 默认返回空 Map，调用方按单条 {@link #closure(Long, Long)} 回退。
     */
    default Map<Long, StopClosure> closures(Long tenantId, Collection<Long> medicationRequestIds) {
        return Map.of();
    }

    record StopCommand(Long tenantId, Long medicationRequestId, Long actorId, String reason) {}

    record StopClosure(String status, Long dispenseTaskId, String pharmacyTaskStatus,
                       BigDecimal dispensedQuantity, BigDecimal consumedQuantity,
                       BigDecimal returnedQuantity, BigDecimal returnableQuantity, String unitCode,
                       Long deliveryId, String deliveryStatus, String action) {
        public boolean returnRequired() {
            return "RETURN_REQUIRED".equals(status);
        }

        public static StopClosure notStopped(String unitCode) {
            return new StopClosure(null, null, null, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO,
                    BigDecimal.ZERO, unitCode, null, null, "NONE");
        }
    }
}
