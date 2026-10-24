package com.rhn.pharmacy.api;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

/** Pharmacy fulfillment boundary used to inspect and atomically consume issued medication facts. */
public interface MedicationFulfillmentDirectory {
    FulfillmentSnapshot fulfillmentForRequest(Long tenantId, Long medicationRequestId);

    /**
     * 批量形式的医嘱供药快照：键为药品请求 id；默认实现退化为逐项调用，与旧适配器语义一致。
     */
    default java.util.Map<Long, FulfillmentSnapshot> fulfillmentsForRequests(
            Long tenantId, java.util.Collection<Long> medicationRequestIds) {
        java.util.Map<Long, FulfillmentSnapshot> result = new java.util.LinkedHashMap<>();
        for (Long id : medicationRequestIds) {
            if (id != null && !result.containsKey(id)) result.put(id, fulfillmentForRequest(tenantId, id));
        }
        return result;
    }

    default FulfillmentSnapshot fulfillmentForConsumer(Long tenantId, Long medicationRequestId,
                                                       String consumerType, Long consumerId) {
        return fulfillmentForRequest(tenantId, medicationRequestId);
    }

    /**
     * 批量形式的消费者供药快照：键为消费者 id，值为对应快照；用于列表装配一次取回。
     * 默认实现退化为逐项调用 {@link #fulfillmentForConsumer}，与旧适配器语义一致。
     */
    default java.util.Map<Long, FulfillmentSnapshot> fulfillmentsForConsumers(
            Long tenantId, String consumerType, java.util.Map<Long, Long> requestIdByConsumerId) {
        java.util.Map<Long, FulfillmentSnapshot> result = new java.util.LinkedHashMap<>();
        requestIdByConsumerId.forEach((consumerId, requestId) -> result.put(consumerId,
                fulfillmentForConsumer(tenantId, requestId, consumerType, consumerId)));
        return result;
    }

    /**
     * Atomically consumes net pharmacy issue facts for one downstream medication administration.
     * Positive issue lines are consumed oldest first; confirmed returns and prior consumptions are excluded.
     */
    ConsumptionSnapshot consume(ConsumptionCommand command);

    List<ConsumptionAllocation> consumptionsFor(Long tenantId, String consumerType, Long consumerId);

    /**
     * 批量形式的核销明细：消费者 id -> 明细列表；默认实现退化为逐项调用 {@link #consumptionsFor}。
     */
    default java.util.Map<Long, List<ConsumptionAllocation>> consumptionsForConsumers(
            Long tenantId, String consumerType, java.util.Collection<Long> consumerIds) {
        java.util.Map<Long, List<ConsumptionAllocation>> result = new java.util.LinkedHashMap<>();
        for (Long consumerId : consumerIds) {
            result.put(consumerId, consumptionsFor(tenantId, consumerType, consumerId));
        }
        return result;
    }

    BigDecimal consumedBaseQuantityForDispenseLine(Long tenantId, Long dispenseLineId);

    record FulfillmentSnapshot(boolean completed, Long dispenseId, BigDecimal netDispensedQuantity,
                               String status) {
        public static FulfillmentSnapshot pending() {
            return new FulfillmentSnapshot(false, null, BigDecimal.ZERO, "NOT_INTAKE");
        }
    }

    record ConsumptionCommand(Long tenantId, Long medicationRequestId, String consumerType, Long consumerId,
                              BigDecimal requiredBaseQuantity, String baseUnitCode,
                              String commandCode, Long actorId) {
    }

    record ConsumptionSnapshot(BigDecimal requiredBaseQuantity, String baseUnitCode,
                               List<ConsumptionAllocation> allocations) {
        public ConsumptionSnapshot {
            allocations = List.copyOf(allocations);
        }
    }

    record ConsumptionAllocation(Long id, Long dispenseTaskLineId, Long dispenseId, Long dispenseLineId,
                                 BigDecimal consumedQuantity, String dispenseUnitCode,
                                 BigDecimal consumedBaseQuantity, String baseUnitCode,
                                 String commandCode, Instant consumedAt) {
    }
}
