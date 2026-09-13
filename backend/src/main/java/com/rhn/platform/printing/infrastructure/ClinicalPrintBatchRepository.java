package com.rhn.platform.printing.infrastructure;

import com.rhn.platform.printing.domain.ClinicalPrintBatch;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface ClinicalPrintBatchRepository extends JpaRepository<ClinicalPrintBatch, Long> {
    Optional<ClinicalPrintBatch> findByTenantIdAndIdempotencyKey(Long tenantId, String idempotencyKey);
    List<ClinicalPrintBatch> findTop50ByTenantIdAndOrganizationIdAndDepartmentIdOrderByCreatedAtDesc(
            Long tenantId, Long organizationId, Long departmentId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select b from ClinicalPrintBatch b where b.id=:id and b.tenantId=:tenantId")
    Optional<ClinicalPrintBatch> lockByIdAndTenantId(Long id, Long tenantId);
}
