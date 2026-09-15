package com.rhn.pharmacy.api;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

/** Pharmacy fulfillment boundary used to inspect and atomically consume issued medication facts. */
public interface MedicationFulfillmentDirectory {
    FulfillmentSnapshot fulfillmentForRequest(Long tenantId, Long medicationRequestId);

    default FulfillmentSnapshot fulfillmentForConsumer(Long tenantId, Long medicationRequestId,
                                                       String consumerType, Long consumerId) {
        return fulfillmentForRequest(tenantId, medicationRequestId);
    }

    /**
     * Atomically consumes net pharmacy issue facts for one downstream medication administration.
     * Positive issue lines are consumed oldest first; confirmed returns and prior consumptions are excluded.
     */
    ConsumptionSnapshot consume(ConsumptionCommand command);

    List<ConsumptionAllocation> consumptionsFor(Long tenantId, String consumerType, Long consumerId);

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
