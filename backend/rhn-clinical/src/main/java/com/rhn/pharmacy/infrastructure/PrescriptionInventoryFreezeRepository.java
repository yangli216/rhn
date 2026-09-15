package com.rhn.pharmacy.infrastructure;

import com.rhn.pharmacy.domain.PrescriptionInventoryFreeze;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface PrescriptionInventoryFreezeRepository extends JpaRepository<PrescriptionInventoryFreeze, Long> {

    List<PrescriptionInventoryFreeze> findByTenantIdAndPrescriptionIdOrderByCreatedAt(Long tenantId, Long prescriptionId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            select f from PrescriptionInventoryFreeze f
            where f.tenantId = :tenantId and f.prescriptionId = :prescriptionId and f.status = 'ACTIVE'
            order by f.createdAt, f.id
            """)
    List<PrescriptionInventoryFreeze> lockActiveByPrescriptionId(
            @Param("tenantId") Long tenantId,
            @Param("prescriptionId") Long prescriptionId);
}
