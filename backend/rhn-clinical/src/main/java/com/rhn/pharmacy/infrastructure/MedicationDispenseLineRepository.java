package com.rhn.pharmacy.infrastructure;

import com.rhn.pharmacy.domain.MedicationDispenseLine;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.List;
import java.util.Collection;
import java.util.Optional;

public interface MedicationDispenseLineRepository extends JpaRepository<MedicationDispenseLine, Long> {
    List<MedicationDispenseLine> findByTenantIdAndMedicationDispenseIdOrderBySortOrder(Long tenantId, Long dispenseId);
    List<MedicationDispenseLine> findByTenantIdAndMedicationDispenseIdInOrderBySortOrder(
            Long tenantId, Collection<Long> dispenseIds);
    Optional<MedicationDispenseLine> findByIdAndTenantId(Long id, Long tenantId);

    interface TaskLineQuantities {
        Long getTaskLineId();
        BigDecimal getIssuedQuantity();
        BigDecimal getReturnedQuantity();
    }

    @Query("""
            select l.taskLineId as taskLineId,
                   sum(case when d.dispenseType in ('DISPENSE', 'REDISPENSE') then l.quantityDispensed else 0 end) as issuedQuantity,
                   sum(case when d.dispenseType = 'RETURN' then l.quantityDispensed else 0 end) as returnedQuantity
            from MedicationDispenseLine l
            join MedicationDispense d on d.id = l.medicationDispenseId and d.tenantId = l.tenantId
            join DispenseTaskLine t on t.id = l.taskLineId and t.tenantId = l.tenantId and t.taskId = d.taskId
            join DispenseTask h on h.id = t.taskId and h.tenantId = t.tenantId
                 and h.residentId = d.residentId and h.encounterId = d.encounterId
            where l.tenantId = :tenantId and l.taskLineId in :taskLineIds
              and d.dispenseType in ('DISPENSE', 'REDISPENSE', 'RETURN')
            group by l.taskLineId
            """)
    List<TaskLineQuantities> flowQuantities(@Param("tenantId") Long tenantId,
                                           @Param("taskLineIds") Collection<Long> taskLineIds);

    @Query("""
            select coalesce(sum(l.quantityDispensed), 0) from MedicationDispenseLine l
            join MedicationDispense d on d.id = l.medicationDispenseId and d.tenantId = l.tenantId
            where l.tenantId = :tenantId and l.originalDispenseLineId = :originalLineId
              and d.dispenseType = 'RETURN'
            """)
    BigDecimal returnedQuantity(@Param("tenantId") Long tenantId, @Param("originalLineId") Long originalLineId);

    interface DispenseLineReturnedQuantity {
        Long getDispenseLineId();
        BigDecimal getReturnedQuantity();
    }

    /** 批量退药量：按原发药行一次汇总，避免发药核销装配逐行查询。 */
    @Query("""
            select l.originalDispenseLineId as dispenseLineId, coalesce(sum(l.quantityDispensed), 0) as returnedQuantity
            from MedicationDispenseLine l
            join MedicationDispense d on d.id = l.medicationDispenseId and d.tenantId = l.tenantId
            where l.tenantId = :tenantId and l.originalDispenseLineId in :originalLineIds
              and d.dispenseType = 'RETURN'
            group by l.originalDispenseLineId
            """)
    List<DispenseLineReturnedQuantity> returnedQuantities(@Param("tenantId") Long tenantId,
                                                          @Param("originalLineIds") Collection<Long> originalLineIds);

    @Query("""
            select l from MedicationDispenseLine l
            join MedicationDispense d on d.id = l.medicationDispenseId and d.tenantId = l.tenantId
            where l.tenantId = :tenantId and l.taskLineId = :taskLineId
              and d.dispenseType in ('DISPENSE', 'REDISPENSE')
              and not exists (select c.id from MedicationDispense c where c.tenantId = d.tenantId
                  and c.originalDispenseId = d.id and c.dispenseType = 'CANCEL')
            order by d.occurredAt, d.id, l.sortOrder, l.id
            """)
    List<MedicationDispenseLine> findIssuedLines(@Param("tenantId") Long tenantId,
                                                 @Param("taskLineId") Long taskLineId);

    /** 批量形式：按任务明细一次取回全部已发出行，顺序与 {@link #findIssuedLines} 一致。 */
    @Query("""
            select l from MedicationDispenseLine l
            join MedicationDispense d on d.id = l.medicationDispenseId and d.tenantId = l.tenantId
            where l.tenantId = :tenantId and l.taskLineId in :taskLineIds
              and d.dispenseType in ('DISPENSE', 'REDISPENSE')
              and not exists (select c.id from MedicationDispense c where c.tenantId = d.tenantId
                  and c.originalDispenseId = d.id and c.dispenseType = 'CANCEL')
            order by l.taskLineId, d.occurredAt, d.id, l.sortOrder, l.id
            """)
    List<MedicationDispenseLine> findIssuedLinesByTaskLineIds(@Param("tenantId") Long tenantId,
                                                              @Param("taskLineIds") Collection<Long> taskLineIds);
}
