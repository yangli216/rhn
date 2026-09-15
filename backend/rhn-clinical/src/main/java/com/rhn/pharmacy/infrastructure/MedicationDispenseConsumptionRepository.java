package com.rhn.pharmacy.infrastructure;

import com.rhn.pharmacy.domain.MedicationDispenseConsumption;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.List;

public interface MedicationDispenseConsumptionRepository
        extends JpaRepository<MedicationDispenseConsumption, Long> {
    List<MedicationDispenseConsumption> findByTenantIdAndConsumerTypeAndConsumerIdOrderById(
            Long tenantId, String consumerType, Long consumerId);

    List<MedicationDispenseConsumption> findByTenantIdAndCommandCodeOrderById(Long tenantId, String commandCode);

    @Query("select coalesce(sum(value.consumedBaseQuantity), 0) from MedicationDispenseConsumption value "
            + "where value.tenantId = :tenantId and value.dispenseLineId = :dispenseLineId")
    BigDecimal consumedBaseQuantity(@Param("tenantId") Long tenantId,
                                    @Param("dispenseLineId") Long dispenseLineId);

    @Query("select coalesce(sum(value.consumedBaseQuantity), 0) from MedicationDispenseConsumption value "
            + "where value.tenantId = :tenantId and value.dispenseTaskLineId = :taskLineId")
    BigDecimal consumedBaseQuantityForTaskLine(@Param("tenantId") Long tenantId,
                                               @Param("taskLineId") Long taskLineId);
}
