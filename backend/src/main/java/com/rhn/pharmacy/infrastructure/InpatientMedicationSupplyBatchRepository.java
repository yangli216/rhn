package com.rhn.pharmacy.infrastructure;

import com.rhn.pharmacy.domain.InpatientMedicationSupplyBatch;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface InpatientMedicationSupplyBatchRepository
        extends JpaRepository<InpatientMedicationSupplyBatch, Long> {
    Optional<InpatientMedicationSupplyBatch> findByTenantIdAndBatchNo(Long tenantId, String batchNo);
    Optional<InpatientMedicationSupplyBatch> findByTenantIdAndGenerationCommandCode(
            Long tenantId, String generationCommandCode);
    List<InpatientMedicationSupplyBatch> findByTenantIdAndStockSiteIdAndStatusOrderByWindowStart(
            Long tenantId, Long stockSiteId, String status);
    List<InpatientMedicationSupplyBatch>
    findByTenantIdAndNursingUnitDepartmentIdAndWindowStartLessThanAndWindowEndGreaterThanOrderByWindowStart(
            Long tenantId, Long departmentId, Instant windowEnd, Instant windowStart);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select value from InpatientMedicationSupplyBatch value "
            + "where value.tenantId = :tenantId and value.id = :batchId")
    Optional<InpatientMedicationSupplyBatch> findLocked(
            @Param("tenantId") Long tenantId, @Param("batchId") Long batchId);
}
