package com.rhn.pharmacy.infrastructure;

import com.rhn.pharmacy.domain.MedicationDispenseLine;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

public interface MedicationDispenseLineRepository extends JpaRepository<MedicationDispenseLine, Long> {
    List<MedicationDispenseLine> findByTenantIdAndMedicationDispenseIdOrderBySortOrder(Long tenantId, Long dispenseId);
    Optional<MedicationDispenseLine> findByIdAndTenantId(Long id, Long tenantId);

    @Query("""
            select coalesce(sum(l.quantityDispensed), 0) from MedicationDispenseLine l
            join MedicationDispense d on d.id = l.medicationDispenseId and d.tenantId = l.tenantId
            where l.tenantId = :tenantId and l.originalDispenseLineId = :originalLineId
              and d.dispenseType = 'RETURN'
            """)
    BigDecimal returnedQuantity(@Param("tenantId") Long tenantId, @Param("originalLineId") Long originalLineId);
}
