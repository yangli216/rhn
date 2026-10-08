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

    @Query("""
            select l from MedicationDispenseLine l
            join MedicationDispense d on d.id = l.medicationDispenseId and d.tenantId = l.tenantId
            where l.tenantId = :tenantId and l.taskLineId = :taskLineId
              and d.dispenseType in ('DISPENSE', 'REDISPENSE')
            order by d.occurredAt, d.id, l.sortOrder, l.id
            """)
    List<MedicationDispenseLine> findIssuedLines(@Param("tenantId") Long tenantId,
                                                 @Param("taskLineId") Long taskLineId);
}
