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
    List<MedicationDispenseConsumption> findByTenantIdAndConsumerTypeAndConsumerIdInOrderById(
            Long tenantId, String consumerType, java.util.Collection<Long> consumerIds);

    List<MedicationDispenseConsumption> findByTenantIdAndCommandCodeOrderById(Long tenantId, String commandCode);

    @Query("select coalesce(sum(value.consumedBaseQuantity), 0) from MedicationDispenseConsumption value "
            + "where value.tenantId = :tenantId and value.dispenseLineId = :dispenseLineId")
    BigDecimal consumedBaseQuantity(@Param("tenantId") Long tenantId,
                                    @Param("dispenseLineId") Long dispenseLineId);

    /** 批量核销量：按发药行一次汇总，避免发药核销装配逐行查询。 */
    @Query("select value.dispenseLineId as dispenseLineId, coalesce(sum(value.consumedBaseQuantity), 0) "
            + "as consumedBaseQuantity from MedicationDispenseConsumption value "
            + "where value.tenantId = :tenantId and value.dispenseLineId in :dispenseLineIds "
            + "group by value.dispenseLineId")
    List<DispenseLineConsumedBaseQuantity> consumedBaseQuantitiesByDispenseLineIds(
            @Param("tenantId") Long tenantId,
            @Param("dispenseLineIds") java.util.Collection<Long> dispenseLineIds);

    interface DispenseLineConsumedBaseQuantity {
        Long getDispenseLineId();

        BigDecimal getConsumedBaseQuantity();
    }

    @Query("select coalesce(sum(value.consumedBaseQuantity), 0) from MedicationDispenseConsumption value "
            + "where value.tenantId = :tenantId and value.dispenseTaskLineId = :taskLineId")
    BigDecimal consumedBaseQuantityForTaskLine(@Param("tenantId") Long tenantId,
                                               @Param("taskLineId") Long taskLineId);

    /** 批量核销量：一次按发药任务行汇总，避免停嘱闭环逐行查询。 */
    @Query("select value.dispenseTaskLineId as taskLineId, coalesce(sum(value.consumedBaseQuantity), 0) "
            + "as consumedQuantity from MedicationDispenseConsumption value "
            + "where value.tenantId = :tenantId and value.dispenseTaskLineId in :taskLineIds "
            + "group by value.dispenseTaskLineId")
    List<TaskLineConsumedQuantity> consumedBaseQuantityByTaskLineIds(
            @Param("tenantId") Long tenantId, @Param("taskLineIds") java.util.Collection<Long> taskLineIds);

    interface TaskLineConsumedQuantity {
        Long getTaskLineId();

        BigDecimal getConsumedQuantity();
    }
}
