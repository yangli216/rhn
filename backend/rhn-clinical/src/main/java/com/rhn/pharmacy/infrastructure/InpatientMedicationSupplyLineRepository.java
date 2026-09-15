package com.rhn.pharmacy.infrastructure;

import com.rhn.pharmacy.domain.InpatientMedicationSupplyLine;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface InpatientMedicationSupplyLineRepository
        extends JpaRepository<InpatientMedicationSupplyLine, Long> {
    List<InpatientMedicationSupplyLine> findByTenantIdAndSupplyBatchIdOrderById(
            Long tenantId, Long supplyBatchId);
    List<InpatientMedicationSupplyLine> findByTenantIdAndRequestIdOrderByCreatedAt(
            Long tenantId, Long requestId);
    Optional<InpatientMedicationSupplyLine> findByTenantIdAndDispenseTaskLineId(
            Long tenantId, Long dispenseTaskLineId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select value from InpatientMedicationSupplyLine value "
            + "where value.tenantId = :tenantId and value.id = :lineId")
    Optional<InpatientMedicationSupplyLine> findLocked(
            @Param("tenantId") Long tenantId, @Param("lineId") Long lineId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select value from InpatientMedicationSupplyLine value "
            + "where value.tenantId = :tenantId and value.id in :lineIds order by value.id")
    List<InpatientMedicationSupplyLine> findAllLocked(
            @Param("tenantId") Long tenantId, @Param("lineIds") List<Long> lineIds);
}
